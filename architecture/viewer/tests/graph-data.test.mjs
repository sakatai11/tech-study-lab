import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readSources, validateGraph } from '../../../scripts/architecture.mjs'
import { createViewerData, graphDataPlugin } from '../graph-data.mjs'

const root = fileURLToPath(new URL('../../..', import.meta.url))

test('viewer data is extracted from current sources, with bounded, exact source excerpts', () => {
  const data = createViewerData(root)
  validateGraph(data.graph)
  const sources = readSources(root)
  for (const node of data.graph.nodes) {
    const snippet = data.snippets[node.id]
    assert.ok(snippet.lines.length <= 14)
    assert.equal(
      snippet.lines[node.source.line - snippet.startLine],
      sources[node.source.file].split('\n')[node.source.line - 1],
    )
  }
  assert.ok(
    !Object.keys(data.graph.sources).some(
      (file) => file.includes('.env') || file.includes('.dev.vars'),
    ),
  )
})

function requestPlugin(method, origin) {
  let handler
  graphDataPlugin(root).configureServer({
    middlewares: {
      use(path, fn) {
        assert.equal(path, '/graph-data.json')
        handler = fn
      },
    },
  })
  const result = { status: 200, headers: {}, body: '' }
  handler(
    { method, headers: { host: '127.0.0.1:4173', ...(origin ? { origin } : {}) } },
    {
      setHeader(key, value) {
        result.headers[key] = value
      },
      writeHead(status) {
        result.status = status
      },
      end(body) {
        result.body = body
      },
    },
  )
  return result
}

test('graph endpoint rejects writes and cross-origin reads', () => {
  assert.equal(requestPlugin('POST').status, 405)
  assert.equal(requestPlugin('GET', 'https://other.example').status, 403)
  const response = requestPlugin('GET', 'http://127.0.0.1:4173')
  assert.equal(response.status, 200)
  assert.equal(response.headers['Cache-Control'], 'no-store')
  assert.ok(JSON.parse(response.body).graph.nodes.length > 0)
})
