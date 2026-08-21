import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue'

export const cloudflareConfig = {
  incrementalCache: r2IncrementalCache,
  queue: doQueue,
}

export default defineCloudflareConfig(cloudflareConfig)
