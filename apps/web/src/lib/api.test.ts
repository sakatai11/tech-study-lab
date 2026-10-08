import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBrowserApiClient, requestJson } from './api'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('createBrowserApiClient', () => {
  it('includes credentials so the Cloudflare Access application cookie reaches the public API', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.com')
    const browserFetch = vi
      .fn()
      .mockResolvedValue(Response.json({ isCorrect: true, correctIndex: 0 }))
    vi.stubGlobal('fetch', browserFetch)

    const client = createBrowserApiClient()
    await client.answers.$post({ json: { questionId: 'question-1', selectedIndex: 0 } })

    expect(browserFetch).toHaveBeenCalledWith(
      'https://api.example.com/answers',
      expect.objectContaining({ credentials: 'include' }),
    )
  })
})

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
