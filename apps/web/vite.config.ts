import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import vinext from 'vinext'
import { defineConfig } from 'vite'

const openNextShimPath = fileURLToPath(new URL('./vinext/opennext-cloudflare.ts', import.meta.url))

export default defineConfig({
  plugins: [
    vinext(),
    {
      name: 'vinext-opennext-cloudflare-alias',
      enforce: 'pre',
      applyToEnvironment: (environment) => environment.name === 'rsc' || environment.name === 'ssr',
      // Vinext server env だけ shim に置き換え、src/lib/api.ts はそのまま使う。
      resolveId(source) {
        if (source === '@opennextjs/cloudflare') return openNextShimPath
      },
    },
    cloudflare({
      configPath: './wrangler.vinext.jsonc',
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
    }),
  ],
})
