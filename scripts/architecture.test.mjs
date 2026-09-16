import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertFresh,
  extract,
  layerOf,
  query,
  readSources,
  validateGraph,
} from './architecture.mjs'

const sources = readSources(process.cwd())
test('tracks shared top-level functions and excludes function-local variables', () => {
  const graph = extract(sources)
  const review = 'symbol:packages/shared/src/srs/sm2.ts#reviewSrs'
  assert(graph.nodes.some((node) => node.id === review))
  assert(graph.edges.some((edge) => edge.relation === 'imports-symbol' && edge.to === review))
  assert(!graph.nodes.some((node) => node.id === 'symbol:packages/shared/src/schema/api.ts#year'))
})

test('preserves qualified table type provenance', () => {
  const graph = extract(sources)
  assert(
    graph.edges.some(
      (edge) =>
        edge.from === 'symbol:packages/shared/src/db/schema.ts#User' &&
        edge.relation === 'derives-schema' &&
        edge.to === 'symbol:packages/shared/src/db/schema.ts#users',
    ),
  )
})

test('resolves direct shared declarations by file and rejects ambiguous barrel names', () => {
  const changed = {
    ...sources,
    'packages/shared/src/one.ts': 'export const duplicate = 1',
    'packages/shared/src/two.ts': 'export const duplicate = 2',
    'apps/api/src/example.ts': "import { duplicate } from '../../../packages/shared/src/one'",
  }
  const graph = extract(changed)
  assert(
    graph.edges.some(
      (edge) =>
        edge.from === 'apps/api/src/example.ts' &&
        edge.relation === 'imports-symbol' &&
        edge.to === 'symbol:packages/shared/src/one.ts#duplicate',
    ),
  )
  assert.throws(
    () =>
      extract({ ...changed, 'apps/api/src/example.ts': "import { duplicate } from '@tsl/shared'" }),
    /Ambiguous shared symbol/,
  )
})

test('records each mount token line and direct root handlers', () => {
  const graph = extract(sources)
  const lines = sources['apps/api/src/app.ts'].split('\n')
  for (const edge of graph.edges.filter((edge) => edge.relation === 'mounts')) {
    assert(lines[edge.source.line - 1].includes(`.route('${edge.prefix}'`))
  }
  const health = graph.nodes.find((node) => node.id === 'endpoint:GET /health')
  assert(health)
  assert(lines[health.source.line - 1].includes(".get('/health'"))
})

test('links imported route calls, service deps parameters and DAL return types', () => {
  const graph = extract(sources)
  const service = 'symbol:apps/api/src/services/review-service.ts#getDueCount'
  const deps = 'symbol:apps/api/src/services/review-service.ts#ReviewDeps'
  const factory = 'symbol:apps/api/src/dal/review-repository.ts#createReviewDeps'
  assert(
    graph.edges.some((e) => e.from === service && e.relation === 'accepts-deps' && e.to === deps),
  )
  assert(
    graph.edges.some((e) => e.from === factory && e.relation === 'returns-deps' && e.to === deps),
  )
  assert(
    graph.edges.some(
      (e) =>
        e.from === 'apps/api/src/routes/dashboard.ts' &&
        e.relation === 'calls-symbol' &&
        e.to === service,
    ),
  )
  const changed = {
    ...sources,
    'apps/api/src/routes/dashboard.ts': sources['apps/api/src/routes/dashboard.ts']
      .replace('{ getDueCount }', '{ getDueCount as countDue }')
      .replace('await getDueCount(', 'await countDue('),
  }
  assert(extract(changed).edges.some((e) => e.relation === 'calls-symbol' && e.to === service))
})
test('extracts existing endpoint, schema and loader relations with provenance', () => {
  const graph = extract(sources)
  validateGraph(graph)
  assert(graph.nodes.some((n) => n.id === 'endpoint:GET /dashboard/due-count'))
  assert(!graph.nodes.some((n) => n.kind === 'http-endpoint' && n.path.includes('userId')))
  assert(
    graph.edges.some(
      (e) => e.relation === 'calls-endpoint' && e.to === 'endpoint:GET /dashboard/due-count',
    ),
  )
  assert(graph.edges.some((e) => e.relation === 'derives-schema'))
  const selected = query(graph, '/dashboard/due-count', 2)
  assert(selected.nodes.some((n) => n.id.includes('load-dashboard.ts')))
  assertFresh(graph, extract(sources))
})

for (const [label, file, before, after] of [
  ['method', 'apps/api/src/routes/dashboard.ts', ".get('/due-count'", ".post('/due-count'"],
  ['path', 'apps/api/src/routes/dashboard.ts', "'/due-count'", "'/different-count'"],
  [
    'import',
    'apps/api/src/routes/dashboard.ts',
    '../services/review-service',
    '../services/domains-service',
  ],
  ['shared schema', 'packages/shared/src/schema/api.ts', 'z.object(', 'z.object( /* changed */'],
  [
    'loader',
    'apps/web/src/features/dashboard/server/load-dashboard.ts',
    'await connection()',
    'await connection(); await connection()',
  ],
]) {
  test(`detects stale snapshot after ${label} changes`, () => {
    assert(sources[file].includes(before))
    const changed = { ...sources, [file]: sources[file].replace(before, after) }
    assert.throws(() => assertFresh(extract(sources), extract(changed)), /stale/)
  })
}

test('rejects binding mismatch and missing entrypoint export', () => {
  for (const [file, before, after] of [
    ['apps/web/wrangler.jsonc', 'tech-study-lab-api', 'wrong-api'],
    ['apps/web/wrangler.jsonc', 'InternalApi', 'MissingApi'],
    ['apps/api/src/index.ts', "export { InternalApi } from './internal-api'", ''],
    [
      'apps/api/src/index.ts',
      "export { InternalApi } from './internal-api'",
      "export { InternalApi } from './app'",
    ],
  ])
    assert.throws(
      () => extract({ ...sources, [file]: sources[file].replace(before, after) }),
      /binding|entrypoint/i,
    )
})

test('rejects unknown relations, dangling edges and invalid provenance', () => {
  const graph = extract(sources)
  for (const edge of [
    { ...graph.edges[0], relation: 'unknown' },
    { ...graph.edges[0], to: 'missing' },
    { ...graph.edges[0], source: { file: '../../outside.ts', line: 1 } },
    { ...graph.edges[0], source: { ...graph.edges[0].source, line: 0 } },
  ])
    assert.throws(() => validateGraph({ ...graph, edges: [edge] }))
})

test('discovers a newly mounted static endpoint without extractor edits', () => {
  const changed = {
    ...sources,
    'apps/api/src/app.ts': `import { extraRoute } from './routes/extra'\n${sources['apps/api/src/app.ts'].replace(".route('/dashboard', dashboardRoute)", ".route('/dashboard', dashboardRoute).route('/extra', extraRoute)")}`,
    'apps/api/src/routes/extra.ts':
      "import { Hono } from 'hono'\nexport const extraRoute = new Hono().get('/status', c => c.json({ ok: true }))",
  }
  assert(extract(changed).nodes.some((n) => n.id === 'endpoint:GET /extra/status'))
})

test('classifies symbol kinds and layers from syntax and path convention', () => {
  const graph = extract(sources)
  const kindOf = (id) => graph.nodes.find((node) => node.id === id)?.kind
  assert.equal(kindOf('symbol:packages/shared/src/db/schema.ts#users'), 'db-table')
  assert.equal(
    kindOf('symbol:packages/shared/src/schema/api.ts#dueCountResponseSchema'),
    'contract-schema',
  )
  // Derived schemas carry no `z.` initializer and are classified by the Schema suffix.
  assert.equal(
    kindOf('symbol:packages/shared/src/schema/content.ts#validatedMcqSchema'),
    'contract-schema',
  )
  assert.equal(kindOf('symbol:apps/api/src/services/review-service.ts#ReviewDeps'), 'deps-type')
  // A *Deps factory is a function, never a deps-type.
  assert.equal(kindOf('symbol:apps/api/src/dal/review-repository.ts#createReviewDeps'), 'function')
  assert.equal(kindOf('symbol:packages/shared/src/srs/sm2.ts#DAY_MS'), 'constant')
  assert(graph.nodes.every((node) => node.layer === layerOf(node.source.file)))
  assert.equal(layerOf('apps/web/src/features/dashboard/server/load-dashboard.ts'), 'web-loader')
  assert.throws(() => layerOf('apps/web/src/components/thing.tsx'), /Unclassified layer/)
})

test('represents declaration as containment and rejects mismatches', () => {
  const graph = extract(sources)
  const module = graph.nodes.find((node) => node.id === 'apps/api/src/dal/review-repository.ts')
  assert.deepEqual(module.symbols, ['createReviewDeps'])
  assert(!graph.edges.some((edge) => edge.relation === 'implements' && edge.from === module.id))
  const drop = graph.nodes.map((node) => (node.id === module.id ? { ...node, symbols: [] } : node))
  assert.throws(() => validateGraph({ ...graph, nodes: drop }), /Undeclared symbol/)
  const extra = graph.nodes.map((node) =>
    node.id === module.id ? { ...node, symbols: [...node.symbols, 'ghost'] } : node,
  )
  assert.throws(() => validateGraph({ ...graph, nodes: extra }), /Declared symbol has no node/)
})

test('rejects relations that violate domain or range', () => {
  const graph = extract(sources)
  const endpoint = 'endpoint:GET /dashboard/due-count'
  const module = 'apps/api/src/routes/dashboard.ts'
  const table = 'symbol:packages/shared/src/db/schema.ts#users'
  const implement = graph.edges.find((edge) => edge.relation === 'implements')
  for (const edge of [
    // implements only runs http-endpoint -> module, never the reverse.
    { ...implement, from: module, to: endpoint },
    // calls-symbol targets a function, not a table.
    { ...implement, relation: 'calls-symbol', from: module, to: table },
    { ...implement, relation: 'unknown' },
  ])
    assert.throws(
      () => validateGraph({ ...graph, edges: [edge] }),
      /domain\/range|Unknown relation/,
    )
})

test('rejects a node kind or layer outside the ontology', () => {
  const graph = extract(sources)
  const swap = (id, patch) =>
    validateGraph({
      ...graph,
      nodes: graph.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
    })
  assert.throws(() => swap('apps/api/src/routes/dashboard.ts', { kind: 'symbol' }), /Invalid node/)
  assert.throws(
    () => swap('apps/api/src/routes/dashboard.ts', { layer: 'api-service' }),
    /Invalid layer/,
  )
})
