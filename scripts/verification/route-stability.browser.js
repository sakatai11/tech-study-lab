/* Workers Free の CPU 上限超過を再検証する連続測定（Issue #220）。
 * Cloudflare Access で認証済みの検証 Web /home を開き、DevTools Console へ全体を貼り付けて実行する。
 * GET のみ。Cookie / JWT / request headers / 応答本文は保存・出力しない。
 * 実行前に CONFIG.commit / webVersion / apiVersion を対象版に設定する。
 * CI の自動測定（scripts/performance-lib.mjs、ADR-0020）と同じ測定条件を保つ。
 */
;(async () => {
  const CONFIG = {
    phase: 'static-shell',
    origin: 'https://tech-study-lab-web-test.sakai111893.workers.dev',
    commit: '',
    webVersion: '',
    apiVersion: '',
    paths: ['/home', '/review', '/domains', '/analytics'],
    warmups: 2,
    samples: 20,
    runs: 3,
    runDeadlineMs: 240000,
    requestDeadlineMs: 10000,
    requiredVinextCache: 'HIT',
    rejectedEdgeCacheStatuses: ['HIT', 'STALE', 'UPDATING', 'REVALIDATED'],
  }
  if (!CONFIG.commit || !CONFIG.webVersion || !CONFIG.apiVersion)
    throw new Error('CONFIG に測定対象の commit と Web/API version を設定する')
  const cases = CONFIG.paths.flatMap((path) => ['html', 'rsc'].map((kind) => ({ path, kind })))
  const perRun = cases.length * (CONFIG.warmups + CONFIG.samples)
  const panelId = 'tsl-route-stability-report'
  if (location.origin !== CONFIG.origin) throw new Error('検証 Web の /home を開いてから実行する')
  if (document.getElementById(panelId)?.dataset.running === 'true') {
    console.log('測定は実行中')
    return
  }
  document.getElementById(panelId)?.remove()
  const panel = document.createElement('section')
  panel.id = panelId
  panel.dataset.running = 'true'
  panel.style.cssText =
    'position:fixed;inset:24px;z-index:2147483647;background:white;color:black;padding:16px;border:2px solid #333;overflow:auto;font:14px sans-serif'
  const heading = document.createElement('h2')
  const output = document.createElement('textarea')
  output.readOnly = true
  output.style.cssText = 'width:100%;height:75%;font:12px monospace'
  panel.append(heading, output)
  document.body.append(panel)

  const percentile = (sorted, p) =>
    sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null
  const summary = (values) => {
    const sorted = values.slice().sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    const median = sorted.length
      ? sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2
      : null
    return {
      n: sorted.length,
      median,
      p95: percentile(sorted, 0.95),
      min: sorted[0] ?? null,
      max: sorted.at(-1) ?? null,
    }
  }

  async function measureOnce(url, c) {
    const controller = new AbortController()
    let deadline
    const start = performance.now()
    const startedAt = new Date().toISOString()
    const operation = (async () => {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'manual',
        headers: c.kind === 'rsc' ? { RSC: '1' } : {},
        signal: controller.signal,
      })
      const headersAt = performance.now()
      const bytes = await response.arrayBuffer()
      const completeAt = performance.now()
      const final = new URL(response.url)
      const entry = performance
        .getEntriesByName(url, 'resource')
        .filter((e) => e.startTime >= start - 1 && e.initiatorType === 'fetch')
        .at(-1)
      // 既定のバッファ（250件）が埋まると後続の Resource Timing が欠けるため、読み取りごとに空ける。
      performance.clearResourceTimings()
      const cc = response.headers.get('cache-control')
      const ct = response.headers.get('content-type')
      const ray = response.headers.get('cf-ray')
      const sameRoute = final.origin === CONFIG.origin && final.pathname === c.path
      const validType =
        c.kind === 'html' ? /text\/html/i.test(ct ?? '') : /text\/x-component/i.test(ct ?? '')
      const cfCacheStatus = response.headers.get('cf-cache-status')
      const vinextCache = response.headers.get('x-vinext-cache')
      const challenged = response.headers.get('cf-mitigated') === 'challenge'
      return {
        status: response.status,
        sameRoute,
        contentType: ct,
        cacheControl: cc,
        cfCacheStatus,
        vinextCache,
        ray,
        colo: ray?.match(/-([A-Z]{3})$/)?.[1] ?? null,
        challenged,
        bytes: bytes.byteLength,
        fetchHeadersMs: headersAt - start,
        fetchCompleteMs: completeAt - start,
        resourceTtfbMs:
          entry && entry.requestStart > 0 && entry.responseStart >= entry.requestStart
            ? entry.responseStart - entry.requestStart
            : null,
        passed:
          response.status === 200 &&
          sameRoute &&
          validType &&
          bytes.byteLength > 0 &&
          !challenged &&
          /^([0-9a-f]+)(?:-[A-Z]{3})?$/.test(ray ?? '') &&
          vinextCache === CONFIG.requiredVinextCache &&
          !CONFIG.rejectedEdgeCacheStatuses.includes(cfCacheStatus),
      }
    })()
    const timeout = new Promise((_, reject) => {
      deadline = setTimeout(() => {
        controller.abort()
        reject(new Error('deadline'))
      }, CONFIG.requestDeadlineMs)
    })
    try {
      return { startedAt, ...(await Promise.race([operation, timeout])) }
    } catch {
      return {
        startedAt,
        passed: false,
        requestError: 'request-failed-or-timeout',
      }
    } finally {
      clearTimeout(deadline)
    }
  }

  async function runOnce(run) {
    const records = []
    const startedAt = Date.now()
    let stoppedReason = null
    outer: for (let round = 0; round < CONFIG.warmups + CONFIG.samples; round++) {
      for (let i = 0; i < cases.length; i++) {
        if (Date.now() - startedAt > CONFIG.runDeadlineMs) {
          stoppedReason = 'run-deadline'
          break outer
        }
        // ラウンドごとに組の順序をずらす。失敗requestは再試行しない。
        const c = cases[(i + round) % cases.length]
        const url = CONFIG.origin + c.path + (c.kind === 'rsc' ? '?_rsc=' : '')
        const row = {
          ...c,
          round: round - CONFIG.warmups + 1,
          warmup: round < CONFIG.warmups,
          ...(await measureOnce(url, c)),
        }
        records.push(row)
        heading.textContent = `測定中: run ${run}/${CONFIG.runs} ${records.length}/${perRun}`
        if (!row.passed) {
          stoppedReason = 'response-validation-failed'
          break outer
        }
      }
    }
    const measured = records.filter((r) => !r.warmup)
    const completed = !stoppedReason && records.length === perRun
    return {
      run,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      completed,
      allPassed: completed && records.every((r) => r.passed),
      stoppedReason,
      results: cases.map((c) => {
        const rows = measured.filter((r) => r.path === c.path && r.kind === c.kind)
        const valid = rows.filter((r) => r.passed)
        return {
          ...c,
          count: rows.length,
          valid: valid.length,
          colos: [...new Set(rows.map((r) => r.colo).filter(Boolean))],
          resourceTtfbMs: summary(valid.map((r) => r.resourceTtfbMs).filter(Number.isFinite)),
          fetchCompleteMs: summary(valid.map((r) => r.fetchCompleteMs)),
        }
      }),
      records,
    }
  }

  const runs = []
  try {
    for (let run = 1; run <= CONFIG.runs; run++) {
      const result = await runOnce(run)
      runs.push(result)
      if (!result.allPassed) break
    }
  } finally {
    panel.dataset.running = 'false'
  }
  const report = {
    schemaVersion: 2,
    ...CONFIG,
    checkedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    order: 'rotate eight cases by round; sequential GET, cache:no-store, credentials:include',
    completedRuns: runs.filter((r) => r.allPassed).length,
    allPassed: runs.length === CONFIG.runs && runs.every((r) => r.allPassed),
    runs,
  }
  output.value = JSON.stringify(report, null, 2)
  heading.textContent = report.allPassed
    ? `測定完了: ${report.completedRuns}/${CONFIG.runs} run`
    : `測定停止: ${report.completedRuns}/${CONFIG.runs} run 完走`
  window.__tslRouteStabilityReport = report
  console.log(output.value)
})()
