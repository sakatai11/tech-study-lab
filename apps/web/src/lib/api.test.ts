import { afterEach, describe, expect, it, vi } from 'vitest'

import { getCloudflareContext } from '@opennextjs/cloudflare'

import { createServerApiClient } from './api'

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(),
}))

const mockGetCloudflareContext = vi.mocked(getCloudflareContext)

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('createServerApiClient', () => {
  it('uses the API service binding when it is available', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ isCorrect: true, correctIndex: 0 }))
    mockGetCloudflareContext.mockResolvedValue({
      env: { API: { fetch: fetcher } },
    } as never)

    const client = await createServerApiClient()
    await client.answers.$post({ json: { questionId: 'question-1', selectedIndex: 0 } })

    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('fails in production when the API service binding is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mockGetCloudflareContext.mockResolvedValue({ env: {} } as never)

    await expect(createServerApiClient()).rejects.toThrow(
      'Cloudflare API service binding (API) is not configured.',
    )
  })

  it('propagates Cloudflare context errors in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const contextError = new Error('context unavailable')
    mockGetCloudflareContext.mockRejectedValue(contextError)

    await expect(createServerApiClient()).rejects.toBe(contextError)
  })

  it('uses the URL fallback outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('API_BASE_URL', 'http://localhost:8787')
    mockGetCloudflareContext.mockRejectedValue(new Error('Node runtime'))

    await expect(createServerApiClient()).resolves.toBeDefined()
  })
})
