import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { query } from '../../../scripts/architecture.mjs'
import { expandSelection } from '../../traversal.mjs'
import { laneOf, layoutGraph, selectGraph } from '../src/graph-model.mjs'

const graph = JSON.parse(readFileSync(new URL('../../graph.json', import.meta.url), 'utf8'))

test('all-relations viewer traversal agrees with the existing CLI at every supported depth', () => {
  for (const text of ['getDueCount', '/dashboard/due-count', 'dueCountResponseSchema']) {
    for (let depth = 0; depth <= 4; depth++) {
      const actual = selectGraph(graph, { text, depth })
      const expected = query(graph, text, depth)
      assert.deepEqual(
        actual.nodes.map((node) => node.id),
        expected.nodes.map((node) => node.id),
      )
      assert.deepEqual(
        actual.edges.map(({ from, relation, to }) => [from, relation, to]),
        expected.edges.map(({ from, relation, to }) => [from, relation, to]),
      )
    }
  }
})

test('search handles case, whitespace, no matches, and clearing the field', () => {
  assert.equal(selectGraph(graph, { text: '  GETDUECOUNT  ', depth: 0 }).nodes.length, 1)
  assert.equal(selectGraph(graph, { text: 'no-such-symbol', depth: 2 }).nodes.length, 0)
  assert.equal(selectGraph(graph, { text: ' ', depth: 0 }).nodes.length, graph.nodes.length)
})

test('following a node uses its exact id, even when other nodes have similar names', () => {
  const node = graph.nodes.find((item) => item.id.endsWith('#getDueCount'))
  const actual = selectGraph(graph, { text: 'review', focus: node.id, depth: 0 })
  assert.deepEqual(
    actual.nodes.map((item) => item.id),
    [node.id],
  )
})

test('relation filtering happens before traversal, not just after rendering', () => {
  const nodes = ['a', 'b', 'c'].map((id) => ({ id, layer: 'api-service' }))
  const edges = [
    { from: 'a', to: 'b', relation: 'imports' },
    { from: 'b', to: 'c', relation: 'calls-symbol' },
  ]
  assert.deepEqual(
    selectGraph({ nodes, edges }, { text: 'a', depth: 2, relation: 'flow' }).nodes.map(
      (node) => node.id,
    ),
    ['a'],
  )
  assert.equal(
    selectGraph({ nodes, edges }, { text: 'a', depth: 2, relation: 'all' }).nodes.length,
    3,
  )
})

test('shared contracts stop expansion unless explicitly selected as a seed', () => {
  const fixture = {
    nodes: [
      { id: 'a', layer: 'api-route' },
      { id: 'schema', layer: 'shared-schema' },
      { id: 'b', layer: 'web-api' },
    ],
    edges: [
      { from: 'a', to: 'schema' },
      { from: 'b', to: 'schema' },
    ],
  }
  assert.deepEqual([...expandSelection(fixture, ['a'], 4)], ['a', 'schema'])
  assert.deepEqual([...expandSelection(fixture, ['schema'], 1)].sort(), ['a', 'b', 'schema'])
  assert.throws(() => expandSelection(fixture, ['a'], 5), /depth/)
})

test('every displayed node is laid out exactly once, without changing its real layer', () => {
  const view = selectGraph(graph)
  const { columns, positions } = layoutGraph(view)
  assert.equal(columns.flat().length, graph.nodes.length)
  assert.equal(
    new Set([...positions.values()].map(({ x, y }) => `${x}:${y}`)).size,
    graph.nodes.length,
  )
  const deps = graph.nodes.find((node) => node.id.endsWith('#ReviewDeps'))
  assert.equal(deps.layer, 'api-service')
  assert.equal(laneOf(deps), 2)
  assert.equal(laneOf(graph.nodes.find((node) => node.kind === 'http-endpoint')), 1)
})
