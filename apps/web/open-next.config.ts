import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'

export const cloudflareConfig = {
  incrementalCache: r2IncrementalCache,
}

export default defineCloudflareConfig(cloudflareConfig)
