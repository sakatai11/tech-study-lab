import { readFileSync } from 'node:fs'

import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'
import { describe, expect, it } from 'vitest'

import { cloudflareConfig } from '../open-next.config'

const wranglerConfig = JSON.parse(
  readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
) as {
  r2_buckets?: Array<{ binding: string; bucket_name: string }>
}

describe('Cloudflare cache configuration', () => {
  it('uses the R2 incremental cache adapter', () => {
    expect(cloudflareConfig.incrementalCache).toBe(r2IncrementalCache)
  })

  it('binds the dedicated production cache bucket', () => {
    expect(wranglerConfig.r2_buckets).toContainEqual({
      binding: 'NEXT_INC_CACHE_R2_BUCKET',
      bucket_name: 'tech-study-lab-web-cache',
    })
  })
})
