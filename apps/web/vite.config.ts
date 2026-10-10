import { cloudflare } from '@cloudflare/vite-plugin'
import { staticAssetsAdapter } from '@vinext/cloudflare/cache/static-assets-adapter'
import vinext from 'vinext'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vinext({
      prerender: { routes: '*', concurrency: 2 },
      cache: { cdn: staticAssetsAdapter() },
    }),
    cloudflare({
      configPath: './wrangler.jsonc',
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
    }),
  ],
})
