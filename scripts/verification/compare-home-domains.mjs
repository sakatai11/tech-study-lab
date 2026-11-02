import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
// Local, macOS-only comparison for Issue #274; never deploys or contacts an API.
// Build the revision first: pnpm --filter @tsl/web build
// Run on both revisions with the same script: node scripts/verification/compare-home-domains.mjs before|after
const phase = process.argv[2]
assert.ok(['before', 'after'].includes(phase), 'Expected before or after')
const outputDirectory = resolve('reports/home-domain-comparison')
mkdirSync(outputDirectory, { recursive: true })
const require = createRequire(import.meta.url)
const wranglerPath = require.resolve('wrangler', { paths: [resolve('apps/web')] })
const wrangler = require(wranglerPath)
// Wrangler's helper returns v4 options; use the existing API-side Miniflare v4.
const { Miniflare, Response } = createRequire(
  require.resolve('wrangler', { paths: [resolve('apps/api')] }),
)('miniflare')
const counts = {}
const fixture = {
  '/dashboard/due-count': { dueCount: 3 },
  '/analytics/summary': {
    totalAnswerCount: 4,
    correctAnswerRate: 75,
    averageResponseTimeMs: 900,
    masteredQuestionCount: 2,
    currentStreakDays: 3,
    thisWeekStudyTimeMs: 120000,
    retentionDistribution: { masteredCount: 2, learningCount: 1, dueCount: 1 },
  },
  '/analytics/heatmap': {
    days: Array.from({ length: 182 }, (_, i) => ({
      date: new Date(Date.parse('2026-03-04T00:00:00Z') + i * 86400000).toISOString().slice(0, 10),
      answerCount: i === 181 ? 4 : 0,
    })),
  },
  '/domains': {
    domains: ['security', 'frontend', 'backend', 'architecture'].map((domain) => ({
      domain,
      masteredQuestionCount: 1,
      totalQuestionCount: 2,
      masteryRate: 50,
      topicCount: 1,
      lessonCount: 1,
    })),
  },
  '/activity/recent': {
    items: [
      {
        id: 'answer:1',
        type: 'answer_recorded',
        occurredAt: Date.parse('2026-08-31T00:00:00Z'),
        questionId: 'security-xss-01-q1',
        lessonId: 'security-xss-01',
        isCorrect: true,
      },
    ],
  },
}
const { workerOptions, main, externalWorkers } = wrangler.unstable_getMiniflareWorkerOptions(
  'apps/web/dist/server/wrangler.json',
)
const mf = new Miniflare({
  workers: [
    {
      ...workerOptions,
      name: 'home-comparison',
      modules: [
        { type: 'ESModule', path: main },
        ...readdirSync('apps/web/dist/server', { recursive: true })
          .filter((p) => p.endsWith('.js') && p !== 'index.js')
          .map((p) => ({ type: 'ESModule', path: resolve('apps/web/dist/server', p) })),
      ],
      modulesRoot: resolve('apps/web/dist/server'),
      serviceBindings: {
        API: async (request) => {
          const path = new URL(request.url).pathname
          assert.ok(path in fixture, path)
          counts[path] = (counts[path] ?? 0) + 1
          return Response.json(fixture[path])
        },
      },
    },
    ...externalWorkers,
  ],
})
const results = []
function workerdCpu() {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,time=,comm='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
  const children = rows.filter(
    (row) => Number(row[1]) === process.pid && row.slice(3).join(' ').endsWith('/workerd'),
  )
  assert.equal(children.length, 1, 'Expected exactly one workerd child')
  const [pid, , time] = children[0]
  const parts = time.split(':').map(Number)
  return { pid, ms: parts.reduce((n, part) => n * 60 + part, 0) * 1000 }
}
try {
  for (const route of ['/home', '/domains']) {
    for (const kind of ['html', 'rsc']) {
      for (const key of Object.keys(counts)) delete counts[key]
      const response = await mf.dispatchFetch(
        `http://localhost${route}${kind === 'rsc' ? '?_rsc=' : ''}`,
        {
          redirect: 'manual',
          headers:
            kind === 'rsc'
              ? { RSC: '1', 'Cache-Control': 'no-cache' }
              : { 'Cache-Control': 'no-cache' },
        },
      )
      const body = await response.text()
      assert.equal(response.status, 200)
      assert.match(
        response.headers.get('content-type'),
        kind === 'rsc' ? /text\/x-component/ : /text\/html/,
      )
      assert.ok(!body.includes('NEXT_HTTP_ERROR_FALLBACK'))
      assert.equal(body.includes('領域別の習得状況'), route === '/domains' || phase === 'before')
      assert.equal(
        counts['/domains'] ?? 0,
        route === '/home' && phase === 'after' ? 0 : kind === 'html' ? 1 : 2,
      )
      if (route === '/home') {
        for (const text of [
          '今日の復習',
          '習得済み問題',
          '2026-03-04: 0問',
          '2026-09-01: 4問',
          '最近のアクティビティ',
          '教材を読む',
        ])
          assert.ok(body.includes(text), text)
      }
      if (kind === 'html') assert.ok(body.includes('href="/domains"'))
      results.push({
        route,
        kind,
        bytes: Buffer.byteLength(body),
        counts: { ...counts },
        domainHeading: body.includes('領域別の習得状況'),
        heatmapLastDay: body.includes('2026-09-01: 4問'),
      })
      writeFileSync(resolve(outputDirectory, `${phase}-${route.slice(1)}-${kind}.txt`), body)
    }
  }
  for (const kind of ['html', 'rsc']) {
    const url = `http://localhost/home${kind === 'rsc' ? '?_rsc=' : ''}`
    const options = {
      redirect: 'manual',
      headers:
        kind === 'rsc'
          ? { RSC: '1', 'Cache-Control': 'no-cache' }
          : { 'Cache-Control': 'no-cache' },
    }
    async function request() {
      const res = await mf.dispatchFetch(url, options)
      assert.equal(res.status, 200)
      const body = await res.text()
      assert.ok(body.includes('2026-09-01: 4問'))
    }
    for (let i = 0; i < 2; i++) await request()
    const samples = []
    for (let batch = 0; batch < 5; batch++) {
      const before = workerdCpu()
      for (let i = 0; i < 100; i++) await request()
      const after = workerdCpu()
      assert.equal(before.pid, after.pid)
      samples.push(Number(((after.ms - before.ms) / 100).toFixed(2)))
    }
    results.find((r) => r.route === '/home' && r.kind === kind).localWorkerdCpuMsPerRequest =
      samples
  }
  writeFileSync(resolve(outputDirectory, `${phase}-results.json`), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally {
  await mf.dispose()
}
