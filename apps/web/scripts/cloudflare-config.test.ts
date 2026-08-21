import { readFileSync } from 'node:fs'

import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue'
import { describe, expect, it } from 'vitest'

import { cloudflareConfig } from '../open-next.config'

const wranglerConfig = JSON.parse(
  readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
) as {
  r2_buckets?: Array<{ binding: string; bucket_name: string }>
  services?: Array<{ binding: string; service: string }>
  durable_objects?: { bindings?: Array<{ name: string; class_name: string }> }
  migrations?: Array<{ tag: string; new_sqlite_classes?: string[] }>
}

describe('Cloudflare cache configuration', () => {
  it('uses the R2 incremental cache adapter', () => {
    expect(cloudflareConfig.incrementalCache).toBe(r2IncrementalCache)
  })

  it('uses the Durable Object queue for time-based revalidation', () => {
    expect(cloudflareConfig.queue).toBe(doQueue)
  })

  it('binds the dedicated production cache bucket', () => {
    expect(wranglerConfig.r2_buckets).toContainEqual({
      binding: 'NEXT_INC_CACHE_R2_BUCKET',
      bucket_name: 'tech-study-lab-web-cache',
    })
  })

  it('binds and migrates the SQLite Durable Object queue with a Worker self-reference', () => {
    expect(wranglerConfig.services).toContainEqual({
      binding: 'WORKER_SELF_REFERENCE',
      service: 'tech-study-lab-web',
    })
    expect(wranglerConfig.durable_objects?.bindings).toContainEqual({
      name: 'NEXT_CACHE_DO_QUEUE',
      class_name: 'DOQueueHandler',
    })
    expect(wranglerConfig.migrations).toContainEqual({
      tag: 'v1',
      new_sqlite_classes: ['DOQueueHandler'],
    })
  })
})
