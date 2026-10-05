import { cloudflare } from '@cloudflare/vite-plugin'
import { staticAssetsAdapter } from '@vinext/cloudflare/cache/static-assets-adapter'
import vinext from 'vinext'
import { defineConfig } from 'vite'

import { openNextCloudflareAlias } from './vinext/opennext-alias-plugin.ts'

export default defineConfig({
  plugins: [
    vinext({
      prerender: { routes: '*', concurrency: 2 },
      cache: { cdn: staticAssetsAdapter() },
    }),
    openNextCloudflareAlias(),
    cloudflare({
      configPath: './wrangler.vinext.jsonc',
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
    }),
  ],
})
