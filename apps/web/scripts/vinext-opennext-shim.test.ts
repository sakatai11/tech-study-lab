import { describe, expect, it, vi } from 'vitest'

const { apiFetcher, cloudflareEnv } = vi.hoisted(() => {
  const apiFetcher = { fetch: vi.fn() }
  return { apiFetcher, cloudflareEnv: { API: apiFetcher } }
})

vi.mock('cloudflare:workers', () => ({ env: cloudflareEnv }))

import { getCloudflareContext } from '../vinext/opennext-cloudflare'

describe('Vinext OpenNext API shim', () => {
  it('returns the Cloudflare worker env with its API service binding', async () => {
    const context = await getCloudflareContext({ async: true })

    expect(context).toEqual({ env: cloudflareEnv })
    expect(context.env.API).toBe(apiFetcher)
  })
})
