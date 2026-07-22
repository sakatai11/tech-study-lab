import { describe, expect, it } from 'vitest'

import { requestJson } from './api-response'

describe('requestJson', () => {
  it('returns the decoded response body for successful requests', async () => {
    await expect(
      requestJson(() => Promise.resolve(Response.json({ ok: true })), '失敗'),
    ).resolves.toEqual({ ok: true })
  })

  it('throws the feature error for unsuccessful requests', async () => {
    await expect(
      requestJson(() => Promise.resolve(new Response(null, { status: 503 })), 'API unavailable'),
    ).rejects.toThrow('API unavailable')
  })
})
