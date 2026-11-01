import assert from 'node:assert/strict'

import {
  PERFORMANCE_CONDITIONS,
  aggregate,
  compactCases,
  compareWithBaseline,
  conditionsId,
  cpuVerdict,
  measureRoutes,
  reconcileCpu,
} from './performance-lib.mjs'

// ログの取り込み遅延を待つ上限と間隔。待ち合わせは同じクエリの再取得であり、測定 request の再試行ではない。
export const LOG_WAIT = Object.freeze({ deadlineMs: 600_000, intervalMs: 30_000, marginMs: 60_000 })
const FIXED_USER_ID = 'user-local-001'
const EVENT_LIMIT = 2000

/** Node fetch の応答から安全な項目と時間だけを取り出す。本文は長さだけを数えて捨てる。 */
export function nodeRequest(headers, deadlineMs = PERFORMANCE_CONDITIONS.requestDeadlineMs) {
  return async (url, kind) => {
    const start = performance.now()
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual',
      headers: kind === 'rsc' ? { ...headers, RSC: '1' } : headers,
      signal: AbortSignal.timeout(deadlineMs),
    })
    const ttfbMs = performance.now() - start
    const bytes = (await response.arrayBuffer()).byteLength
    return {
      url: response.url || url,
      status: response.status,
      contentType: response.headers.get('content-type'),
      cacheControl: response.headers.get('cache-control'),
      cfCacheStatus: response.headers.get('cf-cache-status'),
      vinextCache: response.headers.get('x-vinext-cache'),
      mitigated: response.headers.get('cf-mitigated'),
      ray: response.headers.get('cf-ray'),
      bytes,
      ttfbMs,
      completeMs: performance.now() - start,
    }
  }
}

/** 測定時点の固定ユーザーの状態。件数だけを読み、学習記録の内容は読まない。 */
export async function fixtureState(cloudflare, target, now = Date.now()) {
  const result = await cloudflare(`d1/database/${target.databaseId}/query`, {
    method: 'POST',
    body: {
      sql: 'SELECT (SELECT COUNT(*) FROM questions WHERE is_active = 1) AS activeQuestions, (SELECT COUNT(*) FROM answer_logs WHERE user_id = ?1) AS answerLogs, (SELECT COUNT(*) FROM srs_states WHERE user_id = ?1) AS srsStates, (SELECT COUNT(*) FROM srs_states WHERE user_id = ?1 AND due_at <= ?2) AS dueSrs, (SELECT COUNT(*) FROM lesson_views WHERE user_id = ?1) AS lessonViews',
      params: [FIXED_USER_ID, now],
    },
  })
  const row = result?.[0]?.results?.[0]
  assert(row, 'verification fixture state is unavailable')
  const counts = Object.fromEntries(
    ['activeQuestions', 'answerLogs', 'srsStates', 'dueSrs', 'lessonViews'].map((key) => {
      assert(Number.isSafeInteger(row[key]), `fixture count ${key} is unavailable`)
      return [key, row[key]]
    }),
  )
  return {
    userId: FIXED_USER_ID,
    database: target.database,
    capturedAt: new Date(now).toISOString(),
    counts,
  }
}

/**
 * 時間帯の invocation event を取得する。上限件数で切れた場合は時間帯を二分して全件を集める。
 * 必要な権限は Workers Observability（query）だけ。
 */
export async function queryEvents(observe, scriptName, from, to, depth = 0) {
  const result = await observe({
    queryId: `tsl-performance-${scriptName}`,
    timeframe: { from, to },
    view: 'events',
    limit: EVENT_LIMIT,
    dry: true,
    parameters: {
      filterCombination: 'and',
      filters: [
        { key: '$workers.scriptName', operation: 'eq', type: 'string', value: scriptName },
        { key: '$workers.eventType', operation: 'eq', type: 'string', value: 'fetch' },
      ],
    },
  })
  const events = result?.events?.events
  assert(Array.isArray(events), 'Observability query returned no event list')
  const count = result.events.count ?? events.length
  if (count <= events.length) return events
  assert(depth < 8 && to - from > 1000, 'Observability events cannot be fully listed')
  const middle = Math.floor((from + to) / 2)
  return [
    ...(await queryEvents(observe, scriptName, from, middle, depth + 1)),
    ...(await queryEvents(observe, scriptName, middle + 1, to, depth + 1)),
  ]
}

/** 測定段階。応答の検証に失敗したら停止し、取得できた部分結果を state に残す。 */
async function measure({
  state,
  target,
  versions,
  liveVersion,
  cloudflare,
  headers,
  webUrl,
  request,
}) {
  state.status = 'measuring'
  state.conditionsId = conditionsId()
  state.conditions = PERFORMANCE_CONDITIONS
  state.target = { web: target.web, api: target.api, database: target.database, webUrl }
  state.versions = { start: {}, end: {} }
  for (const worker of ['api', 'web']) {
    state.versions.start[worker] = await liveVersion(worker)
    assert.equal(
      state.versions.start[worker],
      versions[worker],
      `verification ${worker} changed before measurement`,
    )
  }
  state.fixture = await fixtureState(cloudflare, target)
  state.startedAt = new Date().toISOString()
  const measurement = await measureRoutes({
    origin: webUrl,
    request: request ?? nodeRequest(headers),
  })
  state.finishedAt = new Date().toISOString()
  state.runs = measurement.runs
  state.cases = aggregate(measurement.runs)
  if (!measurement.completed) {
    state.status = 'failed'
    state.reason = measurement.runs.at(-1)?.stoppedReason ?? 'incomplete'
    assert.fail(`performance measurement stopped: ${state.reason}`)
  }
  state.status = 'measured'
}

/**
 * CPU ログ照合段階。ログの遅延だけを上限付きで待ち、欠落・version 不一致・取得失敗は判定不能として止める。
 */
async function reconcile({
  state,
  target,
  versions,
  liveVersion,
  observe,
  baseline,
  wait = LOG_WAIT,
  sleep,
  now = Date.now,
}) {
  assert.equal(state.status, 'measured', 'performance measurement did not complete')
  const records = state.runs.flatMap((run) => run.records)
  const from = Date.parse(state.startedAt) - wait.marginMs
  const until = now() + wait.deadlineMs
  let reconciliation
  let verdict
  state.cpu = { status: 'waiting', attempts: 0 }
  for (;;) {
    state.cpu.attempts++
    let events
    try {
      events = await queryEvents(
        observe,
        target.web,
        from,
        Math.min(now(), Date.parse(state.finishedAt) + wait.marginMs),
      )
    } catch {
      state.cpu = { ...state.cpu, status: 'inconclusive', reason: 'observability-query-failed' }
      assert.fail('CPU logs could not be retrieved (check Workers Observability permission)')
    }
    reconciliation = reconcileCpu(records, events, {
      scriptName: target.web,
      version: versions.web,
    })
    verdict = cpuVerdict(reconciliation)
    if (verdict.status !== 'pending' || now() >= until) break
    await sleep(wait.intervalMs)
  }
  let apiExceeded = 0
  if (verdict.status === 'passed') {
    try {
      const events = await queryEvents(
        observe,
        target.api,
        from,
        Math.min(now(), Date.parse(state.finishedAt) + wait.marginMs),
      )
      apiExceeded = events.filter(
        (event) =>
          event.$workers?.scriptVersion?.id === versions.api &&
          typeof event.$workers?.cpuTimeMs === 'number' &&
          /^exceeded/i.test(event.$workers?.outcome ?? ''),
      ).length
    } catch {
      verdict = { status: 'inconclusive', reason: 'observability-query-failed' }
    }
    if (apiExceeded) verdict = { status: 'failed', reason: 'api-resource-limit-exceeded' }
  }
  for (const worker of ['api', 'web']) state.versions.end[worker] = await liveVersion(worker)
  if (
    verdict.status === 'passed' &&
    (state.versions.end.api !== versions.api || state.versions.end.web !== versions.web)
  )
    verdict = { status: 'inconclusive', reason: 'version-changed-during-test' }
  if (verdict.status === 'pending') verdict = { status: 'inconclusive', reason: 'missing-logs' }
  state.cpu = {
    status: verdict.status,
    reason: verdict.reason,
    attempts: state.cpu.attempts,
    expected: reconciliation.expected,
    matched: reconciliation.matched,
    missing: reconciliation.missing.length,
    duplicated: reconciliation.duplicated.length,
    versionMismatch: reconciliation.versionMismatch.length,
    abnormal: reconciliation.abnormal.slice(0, 20),
    apiResourceLimitExceeded: apiExceeded,
  }
  state.cases = aggregate(state.runs, reconciliation.byRay)
  if (verdict.status !== 'passed') {
    state.status = verdict.status
    assert.fail(`CPU log reconciliation ${verdict.status}: ${verdict.reason}`)
  }
  state.comparison = compareWithBaseline(
    { conditionsId: state.conditionsId, fixture: state.fixture, cases: state.cases },
    baseline,
  )
  state.status = 'passed'
}

/**
 * 段階の途中で例外が出たとき、未確定の状態を判定不能にする。
 * 途中の状態のまま Job Summary・artifact に出力しない。
 */
async function settle(state, pending, run) {
  try {
    await run()
  } catch (error) {
    if (state.status === pending) state.status = 'inconclusive'
    throw error
  }
}

export async function measureStage(options) {
  await settle(options.state, 'measuring', () => measure(options))
}

export async function cpuStage(options) {
  await settle(options.state, 'measured', () => reconcile(options))
}

/** 成功記録へ載せる証跡。run / attempt・tree・version・条件と結び付ける。 */
export function performanceProof(state, { tree, runId, runAttempt }) {
  return {
    passed: state.status === 'passed',
    conditionsId: state.conditionsId,
    tree,
    runId,
    runAttempt,
    webVersion: state.versions.start.web,
    apiVersion: state.versions.start.api,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    fixture: state.fixture,
    cpu: { status: state.cpu.status, matched: state.cpu.matched, expected: state.cpu.expected },
    comparison: {
      status: state.comparison.status,
      reason: state.comparison.reason ?? null,
      baselineRunId: state.comparison.baselineRunId ?? null,
      warnings: state.comparison.warnings.slice(0, 32),
    },
    cases: compactCases(state.cases),
  }
}

const fmt = (value) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : '-')

/** Job Summary 用の表。認証情報・本文・ログ本文を含めない。 */
export function performanceSummary(state) {
  const lines = [
    `## Performance test: ${state.status}`,
    '',
    `Conditions: \`${state.conditionsId}\` (${PERFORMANCE_CONDITIONS.runs} runs × ${PERFORMANCE_CONDITIONS.paths.length * PERFORMANCE_CONDITIONS.kinds.length} cases × ${PERFORMANCE_CONDITIONS.warmups}+${PERFORMANCE_CONDITIONS.samples}; ${PERFORMANCE_CONDITIONS.auth})`,
    `Measured: ${state.startedAt ?? '-'} → ${state.finishedAt ?? '-'}; versions start \`${JSON.stringify(state.versions?.start ?? {})}\` end \`${JSON.stringify(state.versions?.end ?? {})}\``,
    `Fixture: \`${JSON.stringify(state.fixture ?? null)}\``,
    `Runs: ${(state.runs ?? []).map((r) => `#${r.run} ${r.completed ? 'completed' : `stopped (${r.stoppedReason})`} ${r.records.length} req`).join('; ') || '-'}`,
    `CPU logs: \`${JSON.stringify(state.cpu ?? null)}\``,
  ]
  if (state.reason) lines.push(`Stopped: ${state.reason}`)
  if (state.cases) {
    lines.push(
      '',
      '| route | kind | valid/count | CPU ms med/p95/max | TTFB ms med/p95/max | complete ms med/p95/max | bytes med | colos |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...state.cases.map(
        (c) =>
          `| ${c.path} | ${c.kind} | ${c.valid}/${c.count} | ${fmt(c.cpuMs.median)}/${fmt(c.cpuMs.p95)}/${fmt(c.cpuMs.max)} | ${fmt(c.ttfbMs.median)}/${fmt(c.ttfbMs.p95)}/${fmt(c.ttfbMs.max)} | ${fmt(c.completeMs.median)}/${fmt(c.completeMs.p95)}/${fmt(c.completeMs.max)} | ${fmt(c.bytes.median)} | ${c.colos.join(',')} |`,
      ),
    )
  }
  if (state.comparison) {
    lines.push(
      '',
      `Comparison: **${state.comparison.status}**${state.comparison.reason ? ` (${state.comparison.reason})` : ''}${state.comparison.baselineRunId ? ` vs run ${state.comparison.baselineRunId}` : ''}`,
      ...state.comparison.warnings.map(
        (w) =>
          `- ⚠️ ${w.path} ${w.kind} ${w.metric} ${w.stat}: ${fmt(w.baseline)} → ${fmt(w.current)}`,
      ),
    )
  }
  return lines.join('\n')
}
