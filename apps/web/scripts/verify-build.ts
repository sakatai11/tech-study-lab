import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import { getLessonRouteParams, getQuizRouteParams, getTopicRouteParams } from '../src/lib/content'

// Run after build without a server (CI):
// pnpm --filter @tsl/web verify:build
const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root))
const answerIndexPattern = /answerIndex(?:&quot;|\\?['"])*\s*:\s*\d/

const manifest = JSON.parse(read('dist/server/vinext-prerender.json').toString()) as {
  routes: Array<{ route: string; path?: string; status: string }>
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

// SSG: every content param is prerendered and nothing else is, so user-specific routes stay SSR.
const renderedPaths = manifest.routes
  .filter(({ status }) => status === 'rendered')
  .map(({ route, path }) => path ?? route)
assert.deepEqual(new Set(renderedPaths), new Set([...staticPaths, '/404']))
for (const pathname of ssrPaths) {
  assert(
    manifest.routes.some((route) => route.route === pathname && route.status === 'skipped'),
    `${pathname} must be rendered per request`,
  )
}

for (const pathname of staticPaths) {
  for (const kind of ['html', 'rsc'] as const) {
    const relativePath = `${pathname === '/' ? 'index' : pathname.slice(1)}.${kind}`
    const generated = read(`dist/server/prerendered-routes/${relativePath}`).toString()
    assert(generated.length > 0, `${pathname} ${kind} is empty`)
    assert(!answerIndexPattern.test(generated), `${pathname} ${kind} leaks answerIndex`)
  }
}

// SSR: the Worker bundle exists and serves the API through the named Service Binding.
const wranglerConfig = JSON.parse(read('dist/server/wrangler.json').toString()) as {
  main?: string
  services?: Array<{ binding: string; entrypoint?: string }>
  assets?: {
    directory?: string
    binding?: string
    run_worker_first?: string[]
  }
}
assert(wranglerConfig.main, 'generated Worker entry is missing')
read(`dist/server/${wranglerConfig.main}`)
assert(
  wranglerConfig.services?.some(
    ({ binding, entrypoint }) => binding === 'API' && entrypoint === 'InternalApi',
  ),
  'API Service Binding is missing',
)

// Public assets must not expose answers, and private cache artifacts must go through the Worker.
for (const entry of readdirSync(new URL('dist/client/', root), {
  recursive: true,
  encoding: 'utf8',
})) {
  if (!entry.endsWith('.js')) continue
  assert(!answerIndexPattern.test(read(`dist/client/${entry}`).toString()), entry)
}
const privateIndex = JSON.parse(
  read('dist/client/_vinext/static-cache/index.json').toString(),
) as Record<string, { kind: string }>
assert(Object.keys(privateIndex).length > 0, 'static cache artifacts are missing')
assert.equal(wranglerConfig.assets?.binding, 'ASSETS')
assert(
  wranglerConfig.assets?.run_worker_first?.includes('/_vinext/static-cache/*'),
  'private static cache artifacts must be routed through the Worker',
)

console.log(
  JSON.stringify(
    {
      contentRoutes: contentPaths.length,
      prerendered: renderedPaths.length,
      ssrRoutes: ssrPaths,
      privateCacheArtifacts: Object.keys(privateIndex).length,
    },
    null,
    2,
  ),
)
