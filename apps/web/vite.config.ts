import { cloudflare } from '@cloudflare/vite-plugin'
import vinext from 'vinext'
import { defineConfig } from 'vite'

import { openNextCloudflareAlias } from './vinext/opennext-alias-plugin.ts'

export default defineConfig({
  plugins: [
    vinext(),
    openNextCloudflareAlias(),
    cloudflare({
      configPath: './wrangler.vinext.jsonc',
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
    }),
  ],
})
