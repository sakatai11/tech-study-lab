import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { getLessonRouteParams, getQuizRouteParams, getTopicRouteParams } from '../src/lib/content'

// Run after build and start, with the local API serving SSR routes:
// pnpm --filter @tsl/web verify:ssg
const root = new URL('../', import.meta.url)
const baseUrl = process.env.WEB_VERIFY_BASE_URL ?? 'http://localhost:3000'
const read = (path: string) => readFileSync(new URL(path, root))
const digest = (body: Uint8Array) => createHash('sha256').update(body).digest('hex')
const manifest = JSON.parse(read('dist/server/vinext-prerender.json').toString()) as {
  routes: Array<{ route: string; path?: string; status: string; revalidate?: number | false }>
}
const contentPaths = [
  ...getTopicRouteParams().map(({ domain, topic }) => `/learn/${domain}/${topic}`),
  ...getLessonRouteParams().map(
    ({ domain, topic, lesson }) => `/learn/${domain}/${topic}/${lesson}`,
  ),
  ...getQuizRouteParams().map(({ lesson }) => `/quiz/${lesson}`),
]
const staticPaths = ['/', ...contentPaths]
const ssrPaths = ['/home', '/review', '/domains', '/analytics']
const renderedPaths = manifest.routes
  .filter(({ status }) => status === 'rendered')
  .map(({ route, path }) => path ?? route)
assert.deepEqual(new Set(renderedPaths), new Set([...staticPaths, '/404']))

for (const pathname of ssrPaths) {
  assert(manifest.routes.some((route) => route.route === pathname && route.status === 'skipped'))
}

const report: Array<Record<string, unknown>> = []
for (const pathname of staticPaths) {
  for (const kind of ['html', 'rsc'] as const) {
    const relativePath = `${pathname === '/' ? 'index' : pathname.slice(1)}.${kind}`
    const generated = read(`dist/server/prerendered-routes/${relativePath}`)
    assert(!/answerIndex(?:&quot;|\\?['"])*\s*:\s*\d/.test(generated.toString()))
    const response = await fetch(`${baseUrl}${pathname}${kind === 'rsc' ? '?_rsc' : ''}`, {
      headers: kind === 'rsc' ? { RSC: '1' } : {},
    })
    assert.equal(response.status, 200, `${pathname} ${kind}`)
    assert(
      response.headers
        .get('content-type')
        ?.includes(kind === 'rsc' ? 'text/x-component' : 'text/html'),
    )
    assert.equal(response.headers.get('x-vinext-cache'), 'HIT', `${pathname} ${kind}`)
    const body = new Uint8Array(await response.arrayBuffer())
    assert.equal(digest(body), digest(generated), `${pathname} ${kind} differs from build artifact`)
    report.push({
      pathname,
      kind,
      status: response.status,
      cache: 'HIT',
      bytes: body.length,
      sha256: digest(body),
    })
  }
}

for (const pathname of ssrPaths) {
  const response = await fetch(`${baseUrl}${pathname}`)
  assert.equal(response.status, 200, pathname)
  assert(response.headers.get('cache-control')?.includes('no-store'), pathname)
  assert.notEqual(response.headers.get('x-vinext-cache'), 'HIT', pathname)
  const html = await response.text()
  assert(!/<h1[^>]*>[^<]*読み込めませんでした/.test(html), `${pathname} returned an error boundary`)
  report.push({
    pathname,
    status: response.status,
    cacheControl: response.headers.get('cache-control'),
  })

  // Client navigation requests the same route as RSC; it must also be rendered per request.
  const rsc = await fetch(`${baseUrl}${pathname}?_rsc`, { headers: { RSC: '1' } })
  assert.equal(rsc.status, 200, `${pathname} rsc`)
  assert(rsc.headers.get('content-type')?.includes('text/x-component'), `${pathname} rsc`)
  assert(rsc.headers.get('cache-control')?.includes('no-store'), `${pathname} rsc`)
  assert.notEqual(rsc.headers.get('x-vinext-cache'), 'HIT', `${pathname} rsc`)
  await rsc.body?.cancel()
  report.push({
    pathname,
    kind: 'rsc',
    status: rsc.status,
    cacheControl: rsc.headers.get('cache-control'),
  })
}

for (const entry of readdirSync(new URL('dist/client/', root), {
  recursive: true,
  encoding: 'utf8',
})) {
  if (!entry.endsWith('.js')) continue
  assert(
    !/answerIndex(?:&quot;|\\?['"])*\s*:\s*\d/.test(read(`dist/client/${entry}`).toString()),
    entry,
  )
}

const privateIndex = JSON.parse(
  read('dist/client/_vinext/static-cache/index.json').toString(),
) as Record<string, { kind: string }>
const privateId = Object.keys(privateIndex)[0]
assert(privateId)
for (const pathname of [
  '/learn/x/y/z',
  '/quiz/nonexistent-lesson',
  '/_vinext/static-cache/index.json',
  `/_vinext/static-cache/${privateId}.${privateIndex[privateId]?.kind}`,
]) {
  const response = await fetch(`${baseUrl}${pathname}`)
  assert.equal(response.status, 404, pathname)
  await response.body?.cancel()
  report.push({ pathname, status: 404 })
}

console.log(
  JSON.stringify(
    {
      build: fileURLToPath(new URL('dist/server/', root)),
      contentRoutes: contentPaths.length,
      privateCacheArtifacts: Object.keys(privateIndex).length,
      checks: report,
    },
    null,
    2,
  ),
)
