import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// Normal SSR and build-time SSG do not need a custom OpenNext cache or queue.
export const cloudflareConfig = {}

export default defineCloudflareConfig(cloudflareConfig)
