import { afterEach, describe, expect, it, vi } from 'vitest'

import { createServerApiClient } from './api-server'

const workerModule = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
}))

vi.mock('cloudflare:workers', () => ({
  get env() {
    return workerModule.env
  },
}))

afterEach(() => {
  workerModule.env = {}
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('createServerApiClient', () => {
  it('uses the API service binding when it is available', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ isCorrect: true, correctIndex: 0 }))
    workerModule.env = { API: { fetch: fetcher } }

    const client = await createServerApiClient()
    await client.answers.$post({ json: { questionId: 'question-1', selectedIndex: 0 } })

    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('fails in production when the API service binding is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    await expect(createServerApiClient()).rejects.toThrow(
      'Cloudflare API service binding (API) is not configured.',
    )
  })

  it('uses the URL fallback outside production when the binding is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('API_BASE_URL', 'http://localhost:8788')
    const urlFetch = vi.fn().mockResolvedValue(Response.json({ isCorrect: true, correctIndex: 0 }))
    vi.stubGlobal('fetch', urlFetch)

    const client = await createServerApiClient()
    await client.answers.$post({ json: { questionId: 'question-1', selectedIndex: 0 } })

    expect(urlFetch).toHaveBeenCalledWith('http://localhost:8788/answers', expect.anything())
  })
})
