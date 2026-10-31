import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  PERFORMANCE_CONDITIONS,
  assertPerformanceProof,
  compareWithBaseline,
  conditionsId,
  evaluateResponse,
  measureRoutes,
  rayIdOf,
  requestsPerRun,
} from './performance-lib.mjs'
import {
  cpuStage,
  measureStage,
  performanceProof,
  performanceSummary,
  queryEvents,
} from './performance.mjs'

const origin = 'https://tech-study-lab-web-test.fixture.workers.dev'
const target = {
  web: 'tech-study-lab-web-test',
  api: 'tech-study-lab-api-test',
  database: 'tech-study-lab-test',
  databaseId: 'db',
}
const versions = { web: 'web-v1', api: 'api-v1' }
const total = requestsPerRun() * PERFORMANCE_CONDITIONS.runs
const fixtureCounts = {
  activeQuestions: 40,
  answerLogs: 12,
  srsStates: 6,
  dueSrs: 3,
  lessonViews: 5,
}

function goodResponse(url, kind, n) {
  return {
    url: url.replace(/\?_rsc=$/, ''),
    status: 200,
    contentType: kind === 'rsc' ? 'text/x-component' : 'text/html; charset=utf-8',
    cacheControl: 'private, no-store',
    cfCacheStatus: 'DYNAMIC',
    vinextCache: null,
    mitigated: null,
    ray: `${n.toString(16).padStart(16, '0')}-NRT`,
    bytes: 1000,
    ttfbMs: 50,
    completeMs: 80,
  }
}

function fakeRequest(override = () => null) {
  let n = 0
  const calls = []
  const request = async (url, kind) => {
    n++
    calls.push(url)
    return override(n, url, kind) ?? goodResponse(url, kind, n)
  }
  return { request, calls }
}

async function measured(request = fakeRequest().request) {
  const state = {}
  await measureStage({
    state,
    target,
    versions,
    liveVersion: async (worker) => versions[worker],
    cloudflare: async () => [{ results: [fixtureCounts] }],
    headers: {},
    webUrl: origin,
    request,
  })
  return state
}

function invocationEvents(state, change = () => ({})) {
  return state.runs
    .flatMap((run) => run.records)
    .map((record, index) => ({
      $metadata: { rayId: record.rayId },
      $workers: {
        scriptName: target.web,
        eventType: 'fetch',
        scriptVersion: { id: versions.web },
        outcome: 'ok',
        cpuTimeMs: 10 + (index % 5),
        wallTimeMs: 40,
        ...change(index),
      },
    }))
}

function cpuOptions(state, observe, extra = {}) {
  let clock = Date.parse(state.finishedAt)
  return {
    state,
    target,
    versions,
    liveVersion: async (worker) => versions[worker],
    observe,
    baseline: null,
    wait: { deadlineMs: 60_000, intervalMs: 20_000, marginMs: 1000 },
    sleep: async (ms) => {
      clock += ms
    },
    now: () => clock,
    ...extra,
  }
}

const observeWith =
  (web, api = []) =>
  async (body) => {
    const name = body.parameters.filters[0].value
    const events = name === target.web ? (typeof web === 'function' ? web() : web) : api
    return { events: { events, count: events.length } }
  }

test('browser measurement and CI measurement share the same conditions [ADR-0016]', () => {
  const source = readFileSync(
    new URL('./verification/route-stability.browser.js', import.meta.url),
    'utf8',
  )
  const value = (key) => source.match(new RegExp(`${key}: ([^,\\n]+),`))?.[1]
  assert.deepEqual(
    JSON.parse(source.match(/paths: (\[[^\]]*\])/)[1].replaceAll("'", '"')),
    PERFORMANCE_CONDITIONS.paths,
  )
  for (const key of ['warmups', 'samples', 'runs', 'runDeadlineMs', 'requestDeadlineMs'])
    assert.equal(Number(value(key)), PERFORMANCE_CONDITIONS[key], key)
  assert.equal(requestsPerRun(), 176)
  assert.equal(total, 528)
})

test('response checks reject redirects, challenges, cache hits and missing evidence [ADR-0016]', () => {
  const c = { path: '/home', kind: 'html' }
  const ok = goodResponse(`${origin}/home`, 'html', 1)
  assert.deepEqual(evaluateResponse(ok, c, origin), [])
  assert.deepEqual(evaluateResponse({ ...ok, status: 302 }, c, origin), ['status-302'])
  assert.deepEqual(evaluateResponse({ ...ok, url: `${origin}/` }, c, origin), ['route-mismatch'])
  assert.deepEqual(evaluateResponse({ ...ok, bytes: 0 }, c, origin), ['empty-body'])
  assert.deepEqual(evaluateResponse({ ...ok, cacheControl: 'public' }, c, origin), [
    'cache-control',
  ])
  assert.deepEqual(evaluateResponse({ ...ok, vinextCache: 'HIT' }, c, origin), ['cache-hit'])
  assert.deepEqual(evaluateResponse({ ...ok, mitigated: 'challenge' }, c, origin), ['challenge'])
  assert.deepEqual(evaluateResponse({ ...ok, ray: null }, c, origin), ['missing-cf-ray'])
  assert.deepEqual(evaluateResponse(ok, { path: '/home', kind: 'rsc' }, origin), ['content-type'])
  assert.equal(rayIdOf('8d9a0b1c2d3e4f50-NRT'), '8d9a0b1c2d3e4f50')
})

test('measurement runs 528 sequential requests in rotated order and stops at the first failure without retry [ADR-0016]', async () => {
  const { request, calls } = fakeRequest()
  const result = await measureRoutes({ origin, request })
  assert.equal(result.completed, true)
  assert.equal(calls.length, 528)
  assert.equal(calls[0], `${origin}/home`)
  assert.equal(calls[8], `${origin}/home?_rsc=`)
  const records = result.runs.flatMap((r) => r.records)
  assert.equal(records.filter((r) => r.warmup).length, 48)

  for (const failure of [
    (n, url, kind) => (n === 30 ? { ...goodResponse(url, kind, n), status: 302 } : null),
    (n) => {
      if (n === 30) throw new Error('timeout')
      return null
    },
  ]) {
    const failing = fakeRequest(failure)
    const stopped = await measureRoutes({ origin, request: failing.request })
    assert.equal(stopped.completed, false)
    assert.equal(failing.calls.length, 30)
    assert.equal(stopped.runs.length, 1)
    assert.equal(stopped.runs[0].stoppedReason, 'response-validation-failed')
    assert.equal(stopped.runs[0].records.at(-1).passed, false)
  }
})

test('measurement stage keeps partial results and refuses a version that changed before measuring [ADR-0016]', async () => {
  const state = {}
  await assert.rejects(
    measureStage({
      state,
      target,
      versions,
      liveVersion: async (worker) => (worker === 'web' ? 'manual' : versions.api),
      cloudflare: async () => [{ results: [fixtureCounts] }],
      headers: {},
      webUrl: origin,
      request: fakeRequest().request,
    }),
    /changed before measurement/,
  )
  assert.equal(state.status, 'inconclusive')
  const failed = {}
  await assert.rejects(
    measureStage({
      state: failed,
      target,
      versions,
      liveVersion: async (worker) => versions[worker],
      cloudflare: async () => [{ results: [fixtureCounts] }],
      headers: {},
      webUrl: origin,
      request: fakeRequest((n, url, kind) =>
        n === 3 ? { ...goodResponse(url, kind, n), status: 500 } : null,
      ).request,
    }),
    /stopped: response-validation-failed/,
  )
  assert.equal(failed.status, 'failed')
  assert.equal(failed.runs[0].records.length, 3)
  assert.match(performanceSummary(failed), /Stopped: response-validation-failed/)
})

test('CPU reconciliation passes only when every ray has an ok invocation of the tested version [ADR-0016]', async () => {
  const state = await measured()
  await cpuStage(cpuOptions(state, observeWith(invocationEvents(state))))
  assert.equal(state.status, 'passed')
  assert.equal(state.cpu.matched, 528)
  assert.equal(state.comparison.status, 'no-baseline')
  assert.equal(state.cases[0].cpuMs.n, 60)
  const proof = performanceProof(state, { tree: 't'.repeat(40), runId: '9', runAttempt: '1' })
  assertPerformanceProof({
    tree: 't'.repeat(40),
    runId: '9',
    runAttempt: '1',
    apiVersion: versions.api,
    webVersion: versions.web,
    performance: proof,
  })
  assert(JSON.stringify(proof).length < 10_000, 'proof must fit in a deployment payload')
  assert.deepEqual(proof.comparison.warnings, [])
})

test('CPU limit, missing logs, version mismatch and query failures never become a success [ADR-0016]', async () => {
  const scenarios = [
    [
      'exceeded CPU',
      (s) => observeWith(invocationEvents(s, (i) => (i === 100 ? { outcome: 'exceededCpu' } : {}))),
      /failed: abnormal-outcome/,
    ],
    [
      'missing logs',
      (s) => observeWith(invocationEvents(s).slice(1)),
      /inconclusive: missing-logs/,
    ],
    [
      'other version',
      (s) =>
        observeWith(
          invocationEvents(s, (i) => (i === 5 ? { scriptVersion: { id: 'web-v0' } } : {})),
        ),
      /inconclusive: version-mismatch/,
    ],
    [
      'query failure',
      () => async () => {
        throw new Error('403')
      },
      /could not be retrieved/,
    ],
    [
      'API exceeded',
      (s) =>
        observeWith(invocationEvents(s), [
          {
            $metadata: {},
            $workers: {
              scriptName: target.api,
              scriptVersion: { id: versions.api },
              outcome: 'exceededCpu',
              cpuTimeMs: 50,
            },
          },
        ]),
      /api-resource-limit-exceeded/,
    ],
  ]
  for (const [name, observe, expected] of scenarios) {
    const state = await measured()
    await assert.rejects(cpuStage(cpuOptions(state, observe(state))), expected, name)
    assert(['failed', 'inconclusive'].includes(state.status), `${name}: ${state.status}`)
  }
  const changed = await measured()
  await assert.rejects(
    cpuStage(
      cpuOptions(changed, observeWith(invocationEvents(changed)), {
        liveVersion: async (w) => (w === 'web' ? 'web-v2' : versions.api),
      }),
    ),
    /version-changed-during-test/,
  )
  // 終了時の version 取得に失敗しても、測定済みのまま出力しない。
  const unreadable = await measured()
  let reads = 0
  await assert.rejects(
    cpuStage(
      cpuOptions(unreadable, observeWith(invocationEvents(unreadable)), {
        liveVersion: async () => {
          reads++
          throw new Error('Cloudflare read failed')
        },
      }),
    ),
    /Cloudflare read failed/,
  )
  assert.equal(reads, 1)
  assert.equal(unreadable.status, 'inconclusive')
  assert.match(performanceSummary(unreadable), /Performance test: inconclusive/)
})

test('delayed logs are awaited within the limit, separately from request retries [ADR-0016]', async () => {
  const state = await measured()
  const all = invocationEvents(state)
  let queries = 0
  await cpuStage(
    cpuOptions(
      state,
      observeWith(() => (++queries < 3 ? all.slice(0, 300) : all)),
    ),
  )
  assert.equal(state.status, 'passed')
  assert.equal(state.cpu.attempts, 3)
})

test('large event windows are split until every event is listed', async () => {
  const events = Array.from({ length: 5 }, (_, i) => ({ timestamp: i }))
  const windows = []
  const observe = async ({ timeframe }) => {
    windows.push(timeframe)
    const inside = events.filter(
      (e) => e.timestamp * 1000 >= timeframe.from && e.timestamp * 1000 <= timeframe.to,
    )
    return { events: { events: inside.slice(0, 2), count: inside.length } }
  }
  const listed = await queryEvents(observe, target.web, 0, 4999)
  assert.deepEqual(listed.map((e) => e.timestamp).sort(), [0, 1, 2, 3, 4])
  assert(windows.length > 1)
})

test('regressions against a comparable baseline are warnings, not failures [ADR-0016]', async () => {
  const state = await measured()
  await cpuStage(cpuOptions(state, observeWith(invocationEvents(state))))
  const baseline = performanceProof(state, { tree: 't', runId: '8', runAttempt: '1' })
  const slower = await measured(
    fakeRequest((n, url, kind) => ({ ...goodResponse(url, kind, n), ttfbMs: 400, completeMs: 500 }))
      .request,
  )
  await cpuStage(
    cpuOptions(slower, observeWith(invocationEvents(slower, () => ({ cpuTimeMs: 40 }))), {
      baseline,
    }),
  )
  assert.equal(slower.status, 'passed')
  assert.equal(slower.comparison.status, 'compared')
  assert.equal(slower.comparison.baselineRunId, '8')
  assert(slower.comparison.warnings.some((w) => w.metric === 'cpuMs'))
  assert(slower.comparison.warnings.some((w) => w.metric === 'ttfbMs'))
  assert.match(performanceSummary(slower), /⚠️/)
  // 警告は成功記録にも明示して残す。
  const slowerProof = performanceProof(slower, { tree: 't', runId: '9', runAttempt: '1' })
  assert.equal(slowerProof.passed, true)
  assert(slowerProof.comparison.warnings.some((w) => w.metric === 'cpuMs'))

  const current = { conditionsId: conditionsId(), fixture: state.fixture, cases: state.cases }
  assert.equal(
    compareWithBaseline(current, { ...baseline, conditionsId: 'old' }).reason,
    'conditions-changed',
  )
  assert.equal(
    compareWithBaseline(current, {
      ...baseline,
      fixture: { ...baseline.fixture, counts: { ...fixtureCounts, srsStates: 60 } },
    }).reason,
    'fixture-changed',
  )
  // smoke の書き込みによる小さな増加は比較可能のまま扱う。
  assert.equal(
    compareWithBaseline(current, {
      ...baseline,
      fixture: { ...baseline.fixture, counts: { ...fixtureCounts, answerLogs: 11 } },
    }).status,
    'compared',
  )
  assert.equal(compareWithBaseline(current, null).status, 'no-baseline')
})
