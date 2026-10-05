import { fileURLToPath } from 'node:url'

import type { Plugin } from 'vite'

export const openNextShimPath = fileURLToPath(new URL('./opennext-cloudflare.ts', import.meta.url))
const serverEnvironments = new Set(['rsc', 'ssr'])

export function openNextCloudflareAlias(): Plugin {
  return {
    name: 'vinext-opennext-cloudflare-alias',
    enforce: 'pre',
    applyToEnvironment: (environment) => serverEnvironments.has(environment.name),
    // Vinext server env だけ shim に置き換え、src/lib/api.ts はそのまま使う。
    resolveId(source) {
      if (source === '@opennextjs/cloudflare') return openNextShimPath
    },
  }
}
