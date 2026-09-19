import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { cloudflareConfig } from '../open-next.config'

const wranglerConfig = JSON.parse(
  readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
) as {
  services?: Array<{ binding: string; service: string }>
  r2_buckets?: unknown
  durable_objects?: unknown
  migrations?: unknown
}

describe('Cloudflare SSR configuration', () => {
  it('keeps the API Service Binding for server loaders', () => {
    expect(wranglerConfig.services).toContainEqual({
      binding: 'API',
      service: 'tech-study-lab-api',
      entrypoint: 'InternalApi',
    })
  })

  it('does not configure a custom OpenNext cache or revalidation queue', () => {
    expect(cloudflareConfig).not.toHaveProperty('incrementalCache')
    expect(cloudflareConfig).not.toHaveProperty('queue')
  })

  it('does not bind PPR-only cache infrastructure', () => {
    expect(wranglerConfig.r2_buckets).toBeUndefined()
    expect(wranglerConfig.durable_objects).toBeUndefined()
    expect(wranglerConfig.migrations).toBeUndefined()
    expect(wranglerConfig.services).not.toContainEqual(
      expect.objectContaining({ binding: 'WORKER_SELF_REFERENCE' }),
    )
  })
})
