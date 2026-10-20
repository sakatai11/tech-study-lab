import assert from 'node:assert/strict'
import test from 'node:test'
import { parseGraphResponse } from '../src/graph-response.mjs'

const fallback = 'Graph を読み込めませんでした。'

test('non-JSON error and success responses show the readable load error', async () => {
  for (const status of [404, 500, 200]) {
    await assert.rejects(parseGraphResponse(new Response('<html>Not found</html>', { status })), {
      message: fallback,
    })
  }
  await assert.rejects(parseGraphResponse(Response.json(null)), { message: fallback })
})

test('JSON HTTP errors preserve a server message, with a fallback for invalid messages', async () => {
  await assert.rejects(
    parseGraphResponse(Response.json({ error: 'Same-origin requests only' }, { status: 403 })),
    { message: 'Same-origin requests only' },
  )
  for (const error of [null, {}, '', 123]) {
    await assert.rejects(parseGraphResponse(Response.json({ error }, { status: 500 })), {
      message: fallback,
    })
  }
})

test('valid graph data is returned and incomplete data has a format error', async () => {
  const data = { graph: { nodes: [], edges: [] }, snippets: {} }
  assert.deepEqual(await parseGraphResponse(Response.json(data)), data)
  await assert.rejects(parseGraphResponse(Response.json({})), {
    message: 'Graph データの形式を確認してください。',
  })
})

test('cancelling a response body remains an AbortError', async () => {
  const error = new DOMException('Cancelled', 'AbortError')
  await assert.rejects(
    parseGraphResponse({
      json: async () => {
        throw error
      },
    }),
    (cause) => cause === error,
  )
})
