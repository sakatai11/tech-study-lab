import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import nextConfig from '../next.config'

type WranglerConfig = {
  name: string
  main: string
  compatibility_date: string
  compatibility_flags: string[]
  services?: Array<{ binding: string; service: string; entrypoint: string }>
  migrations?: unknown
  durable_objects?: unknown
  r2_buckets?: unknown
  kv_namespaces?: unknown
  assets?: { binding: string; directory: string; run_worker_first?: string[] }
  env?: Record<string, Partial<WranglerConfig>>
  observability?: { enabled: boolean; head_sampling_rate: number }
  preview_urls?: boolean
  workers_dev?: boolean
  account_id?: string
  d1_databases?: Array<{
    binding: string
    database_name: string
    database_id: string
  }>
  ratelimits?: Array<{ name: string; namespace_id: string }>
  vars?: Record<string, string>
}

function readJsonc(url: URL): WranglerConfig {
  const source = readFileSync(url, 'utf8').replace(/^\s*\/\/.*$/gm, '')
  return JSON.parse(source) as WranglerConfig
}

const productionMigrations = [
  { tag: 'v1', new_sqlite_classes: ['DOQueueHandler'] },
  { tag: 'v2', deleted_classes: ['DOQueueHandler'] },
]

describe('Web Worker configuration', () => {
  const config = readJsonc(new URL('../wrangler.jsonc', import.meta.url))

  it('deploys the Vinext Worker as the production web Worker', () => {
    expect(config.name).toBe('tech-study-lab-web')
    expect(config.main).toBe('vinext/server/fetch-handler')
    expect(config.compatibility_flags).toEqual([
      'nodejs_compat',
      'global_fetch_strictly_public',
      'enable_weak_ref',
    ])
    expect(config.services).toEqual([
      {
        binding: 'API',
        service: 'tech-study-lab-api',
        entrypoint: 'InternalApi',
      },
    ])
  })

  it('keeps the registered Durable Object migration history', () => {
    expect(config.migrations).toEqual(productionMigrations)
  })

  it('does not enable Cache Components or bind PPR-only cache infrastructure', () => {
    expect(nextConfig).not.toHaveProperty('cacheComponents')
    expect(config.durable_objects).toBeUndefined()
    expect(config.r2_buckets).toBeUndefined()
    expect(config.kv_namespaces).toBeUndefined()
    expect(config.services).not.toContainEqual(
      expect.objectContaining({ binding: 'WORKER_SELF_REFERENCE' }),
    )
  })

  it('serves built client assets and routes private static cache artifacts through the Worker', () => {
    expect(config.assets).toMatchObject({
      binding: 'ASSETS',
      directory: 'dist/client',
    })
    expect(config.assets?.run_worker_first).toContain('/_vinext/static-cache/*')
  })

  it('isolates edge verification from the production API and migration history', () => {
    const edge = config.env?.edge

    expect(edge?.name).toBe('tech-study-lab-web-vinext')
    expect(edge?.services).toEqual([
      {
        binding: 'API',
        service: 'tech-study-lab-api-vinext',
        entrypoint: 'InternalApi',
      },
    ])
    // Wrangler inherits top-level migrations, so the edge Worker must opt out explicitly.
    expect(edge?.migrations).toEqual([])
    expect(edge?.observability).toEqual({
      enabled: true,
      head_sampling_rate: 1,
    })
    expect(edge?.preview_urls).toBe(false)
    expect(edge?.workers_dev).toBe(true)
  })

  it('keeps edge writes in a dedicated D1 and rate limit namespace', () => {
    const api = readJsonc(new URL('../../api/wrangler.vinext.jsonc', import.meta.url))
    const production = readFileSync(new URL('../../api/wrangler.toml', import.meta.url), 'utf8')

    expect(api.name).toBe('tech-study-lab-api-vinext')
    expect(api.account_id).toBe('4459a4d59a634a07eac0400d39b84f20')
    expect(api.d1_databases).toHaveLength(1)
    expect(api.d1_databases?.[0]).toMatchObject({
      binding: 'DB',
      database_name: 'tech-study-lab-vinext',
    })
    const databaseId = api.d1_databases?.[0]?.database_id
    expect(databaseId).toMatch(/^[0-9a-f-]{36}$/)
    expect(production).not.toContain(databaseId)
    expect(api.ratelimits).toHaveLength(2)
    for (const limiter of api.ratelimits ?? []) {
      expect(production).not.toContain(`namespace_id = "${limiter.namespace_id}"`)
    }
    expect(api.vars).toBeUndefined()
    expect(api.preview_urls).toBe(false)
  })

  it('builds, serves, and deploys through Vinext without OpenNext', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      scripts: Record<string, string>
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')

    expect(packageJson.scripts).toMatchObject({
      dev: 'vite dev --port 3000',
      build: 'pnpm content:generate && node scripts/build.mjs',
      start: 'wrangler dev --config dist/server/wrangler.json --port 3000',
      preview: 'pnpm build && pnpm start',
      deploy: 'node scripts/deploy.mjs production',
      'deploy:edge': 'node scripts/deploy.mjs edge',
      'cf-typegen': 'wrangler types --config wrangler.jsonc --include-runtime=false',
    })
    for (const script of Object.values(packageJson.scripts)) {
      expect(script).not.toMatch(/opennext|next (dev|build|start)|VINEXT=/)
    }
    expect({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    }).not.toHaveProperty('@opennextjs/cloudflare')
    expect(viteConfig).toContain("configPath: './wrangler.jsonc'")
    expect(existsSync(new URL('../open-next.config.ts', import.meta.url))).toBe(false)
    expect(existsSync(new URL('../wrangler.vinext.jsonc', import.meta.url))).toBe(false)
  })
})
