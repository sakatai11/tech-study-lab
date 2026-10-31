import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

// 検証環境の連続測定の条件（ADR-0016）。scripts/verification/route-stability.browser.js と同じ値を保つ。
// 値を変えると conditionsId が変わり、以前の結果との比較・本番昇格の証跡には使われなくなる。
export const PERFORMANCE_CONDITIONS = Object.freeze({
  schemaVersion: 1,
  paths: ['/home', '/review', '/domains', '/analytics'],
  kinds: ['html', 'rsc'],
  warmups: 2,
  samples: 20,
  runs: 3,
  runDeadlineMs: 240_000,
  requestDeadlineMs: 10_000,
  order: 'rotate eight cases by round; sequential GET; stop at first failure; no retry',
  cache: 'no-store',
  rsc: '?_rsc= with RSC: 1',
  auth: 'Cloudflare Access service token headers (CI); browser measurement uses the Access session cookie',
  client: 'Node.js fetch on GitHub-hosted runner; TTFB = response headers received',
})

// 導入当初は悪化を警告に留める。相対値と絶対値の両方を超えた場合だけ警告し、小さな値の揺らぎを拾わない。
export const WARNING_THRESHOLDS = Object.freeze({
  ratio: 1.5,
  cpuMs: 5,
  timingMs: 100,
})

// fixture の件数がこれ以上変わった直前結果とは比較しない（smoke の書き込みによる微増は許容する）。
export const FIXTURE_TOLERANCE = 0.1

export const OK_OUTCOME = 'ok'

export function conditionsId(conditions = PERFORMANCE_CONDITIONS) {
  return createHash('sha256').update(JSON.stringify(conditions)).digest('hex').slice(0, 16)
}

export function measurementCases(conditions = PERFORMANCE_CONDITIONS) {
  return conditions.paths.flatMap((path) => conditions.kinds.map((kind) => ({ path, kind })))
}

export function requestsPerRun(conditions = PERFORMANCE_CONDITIONS) {
  return measurementCases(conditions).length * (conditions.warmups + conditions.samples)
}

/** ラウンドごとに組の順序をずらす（route-stability.browser.js と同じ規則）。 */
export function caseAt(cases, round, index) {
  return cases[(index + round) % cases.length]
}

export function caseUrl(origin, c) {
  return origin + c.path + (c.kind === 'rsc' ? '?_rsc=' : '')
}

/** cf-ray の末尾の colo を除いた Ray ID。Observability の `$metadata.rayId` と照合する。 */
export function rayIdOf(ray) {
  return ray?.match(/^([0-9a-f]+)(?:-[A-Z]{3})?$/)?.[1] ?? null
}

/** 応答の安全な項目だけを検査する。本文・request header・Cookie は受け取らない。 */
export function evaluateResponse(response, c, origin) {
  const reasons = []
  const final = new URL(response.url)
  if (response.status !== 200) reasons.push(`status-${response.status}`)
  if (final.origin !== origin || final.pathname !== c.path) reasons.push('route-mismatch')
  const type = response.contentType ?? ''
  if (!(c.kind === 'html' ? /text\/html/i : /text\/x-component/i).test(type))
    reasons.push('content-type')
  if (!(response.bytes > 0)) reasons.push('empty-body')
  if (!/\bno-store\b/i.test(response.cacheControl ?? '')) reasons.push('cache-control')
  if (response.vinextCache === 'HIT' || response.cfCacheStatus === 'HIT') reasons.push('cache-hit')
  if (response.mitigated === 'challenge') reasons.push('challenge')
  if (!rayIdOf(response.ray)) reasons.push('missing-cf-ray')
  return reasons
}

/**
 * 8組を逐次 GET で測定する。最初の異常でそのラン以降を止め、失敗 request を再試行しない。
 * `request(url, kind)` は応答の安全な項目と時間だけを返す（タイムアウトは reject）。
 */
export async function measureRoutes({
  origin,
  request,
  now = Date.now,
  conditions = PERFORMANCE_CONDITIONS,
  onProgress = () => {},
}) {
  const cases = measurementCases(conditions)
  const perRun = requestsPerRun(conditions)
  const runs = []
  for (let run = 1; run <= conditions.runs; run++) {
    const records = []
    const startedAt = now()
    let stoppedReason = null
    outer: for (let round = 0; round < conditions.warmups + conditions.samples; round++) {
      for (let i = 0; i < cases.length; i++) {
        if (now() - startedAt > conditions.runDeadlineMs) {
          stoppedReason = 'run-deadline'
          break outer
        }
        const c = caseAt(cases, round, i)
        const base = {
          run,
          ...c,
          round: round - conditions.warmups + 1,
          warmup: round < conditions.warmups,
          startedAt: new Date(now()).toISOString(),
        }
        let row
        try {
          const response = await request(caseUrl(origin, c), c.kind)
          const reasons = evaluateResponse(response, c, origin)
          row = {
            ...base,
            status: response.status,
            contentType: response.contentType,
            cacheControl: response.cacheControl,
            cfCacheStatus: response.cfCacheStatus,
            vinextCache: response.vinextCache,
            ray: response.ray,
            rayId: rayIdOf(response.ray),
            colo: response.ray?.match(/-([A-Z]{3})$/)?.[1] ?? null,
            bytes: response.bytes,
            ttfbMs: response.ttfbMs,
            completeMs: response.completeMs,
            passed: reasons.length === 0,
            reasons,
          }
        } catch {
          row = { ...base, passed: false, reasons: ['request-failed-or-timeout'] }
        }
        records.push(row)
        onProgress(run, records.length, perRun)
        if (!row.passed) {
          stoppedReason = 'response-validation-failed'
          break outer
        }
      }
    }
    const completed = !stoppedReason && records.length === perRun
    runs.push({
      run,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(now()).toISOString(),
      completed,
      stoppedReason,
      records,
    })
    if (!completed) break
  }
  return {
    runs,
    completed: runs.length === conditions.runs && runs.every((r) => r.completed),
  }
}

/**
 * 測定 record と Observability の invocation event を cf-ray で1対1に対応付ける。
 * event は `$metadata.rayId` と `$workers.{scriptName, scriptVersion.id, outcome, cpuTimeMs, wallTimeMs}` だけを使う。
 */
export function reconcileCpu(records, events, { scriptName, version }) {
  const invocations = new Map()
  const versionMismatch = new Set()
  for (const event of events) {
    const workers = event.$workers
    const rayId = event.$metadata?.rayId
    if (!rayId || workers?.scriptName !== scriptName || typeof workers.cpuTimeMs !== 'number')
      continue
    if (workers.scriptVersion?.id !== version) {
      versionMismatch.add(rayId)
      continue
    }
    invocations.set(rayId, [...(invocations.get(rayId) ?? []), workers])
  }
  const matched = new Map()
  const missing = []
  const duplicated = []
  const abnormal = []
  for (const record of records) {
    const found = invocations.get(record.rayId)
    if (!found) {
      missing.push(record.rayId)
      continue
    }
    if (found.length !== 1) duplicated.push(record.rayId)
    const invocation = found[0]
    if (invocation.outcome !== OK_OUTCOME)
      abnormal.push({ rayId: record.rayId, outcome: invocation.outcome })
    matched.set(record.rayId, {
      cpuTimeMs: invocation.cpuTimeMs,
      wallTimeMs: invocation.wallTimeMs ?? null,
      outcome: invocation.outcome,
    })
  }
  return {
    expected: records.length,
    matched: matched.size,
    missing,
    duplicated,
    abnormal,
    versionMismatch: records.filter((r) => versionMismatch.has(r.rayId)).map((r) => r.rayId),
    byRay: matched,
  }
}

/** 照合結果から、待ち合わせを続けるか・判定不能か・失敗かを決める。 */
export function cpuVerdict(reconciliation) {
  if (reconciliation.abnormal.length) return { status: 'failed', reason: 'abnormal-outcome' }
  if (reconciliation.versionMismatch.length)
    return { status: 'inconclusive', reason: 'version-mismatch' }
  if (reconciliation.duplicated.length)
    return { status: 'inconclusive', reason: 'duplicated-invocation' }
  if (reconciliation.missing.length) return { status: 'pending', reason: 'missing-logs' }
  return { status: 'passed', reason: null }
}

export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return { n: 0, median: null, p95: null, max: null }
  const middle = Math.floor(sorted.length / 2)
  return {
    n: sorted.length,
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)],
    max: sorted.at(-1),
  }
}

/** route × HTML/RSC ごとに warmup と本測定を分けて集計する。 */
export function aggregate(runs, cpuByRay = new Map(), conditions = PERFORMANCE_CONDITIONS) {
  const records = runs.flatMap((r) => r.records)
  return measurementCases(conditions).map((c) => {
    const rows = records.filter((r) => r.path === c.path && r.kind === c.kind)
    const measured = rows.filter((r) => !r.warmup)
    const valid = measured.filter((r) => r.passed)
    return {
      ...c,
      warmup: { count: rows.length - measured.length },
      count: measured.length,
      valid: valid.length,
      failed: measured.length - valid.length,
      colos: [...new Set(valid.map((r) => r.colo).filter(Boolean))],
      cpuMs: distribution(valid.map((r) => cpuByRay.get(r.rayId)?.cpuTimeMs)),
      ttfbMs: distribution(valid.map((r) => r.ttfbMs)),
      completeMs: distribution(valid.map((r) => r.completeMs)),
      bytes: distribution(valid.map((r) => r.bytes)),
    }
  })
}

function fixtureComparable(current, baseline) {
  return Object.keys(current).every((key) => {
    const a = current[key]
    const b = baseline?.[key]
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false
    return Math.abs(a - b) <= Math.max(1, Math.abs(b) * FIXTURE_TOLERANCE)
  })
}

/**
 * 比較可能な直前の成功結果と比べ、悪化を警告として返す。警告は失敗・比較不能と区別する。
 * baseline は直前の検証成功記録の `performance`（未導入の記録は null）。
 */
export function compareWithBaseline(current, baseline) {
  if (!baseline?.cases) return { status: 'no-baseline', baselineRunId: null, warnings: [] }
  if (baseline.conditionsId !== current.conditionsId)
    return { status: 'not-comparable', reason: 'conditions-changed', warnings: [] }
  if (baseline.fixture?.userId !== current.fixture.userId)
    return { status: 'not-comparable', reason: 'fixture-user-changed', warnings: [] }
  if (!fixtureComparable(current.fixture.counts, baseline.fixture?.counts))
    return { status: 'not-comparable', reason: 'fixture-changed', warnings: [] }
  const warnings = []
  for (const now of current.cases) {
    const before = baseline.cases.find((c) => c.path === now.path && c.kind === now.kind)
    if (!before) continue
    for (const [metric, floor] of [
      ['cpuMs', WARNING_THRESHOLDS.cpuMs],
      ['ttfbMs', WARNING_THRESHOLDS.timingMs],
      ['completeMs', WARNING_THRESHOLDS.timingMs],
    ]) {
      for (const stat of ['median', 'p95']) {
        const a = now[metric]?.[stat]
        const b = before[metric]?.[stat]
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue
        if (a >= b * WARNING_THRESHOLDS.ratio && a - b >= floor)
          warnings.push({ path: now.path, kind: now.kind, metric, stat, baseline: b, current: a })
      }
    }
  }
  return {
    status: 'compared',
    baselineRunId: baseline.runId ?? null,
    warnings,
  }
}

/** 成功記録へ載せる要約。GitHub Deployment の payload に収まる大きさに保つ。 */
export function compactCases(cases) {
  const pick = ({ median, p95, max }) => ({ median, p95, max })
  return cases.map((c) => ({
    path: c.path,
    kind: c.kind,
    valid: c.valid,
    cpuMs: pick(c.cpuMs),
    ttfbMs: pick(c.ttfbMs),
    completeMs: pick(c.completeMs),
  }))
}

/**
 * 本番の事前検査で、検証成功記録が同じ測定条件の性能試験に成功していることを確かめる（ADR-0016）。
 * source tree と稼働中 version の照合は呼び出し側が行う。
 */
export function assertPerformanceProof(verified, id = conditionsId()) {
  const proof = verified?.performance
  assert(proof, 'verification success has no performance test proof')
  assert.equal(proof.passed, true, 'verification performance test did not pass')
  assert.equal(proof.conditionsId, id, 'verification performance conditions differ')
  assert.equal(proof.cpu?.status, 'passed', 'verification CPU log reconciliation did not pass')
  assert.equal(proof.tree, verified.tree, 'performance proof is for another source tree')
  assert.equal(
    proof.webVersion,
    verified.webVersion,
    'performance proof is for another Web version',
  )
  assert.equal(
    proof.apiVersion,
    verified.apiVersion,
    'performance proof is for another API version',
  )
  assert.equal(proof.runId, verified.runId, 'performance proof is from another workflow run')
  assert.equal(
    proof.runAttempt,
    verified.runAttempt,
    'performance proof is from another workflow attempt',
  )
}
