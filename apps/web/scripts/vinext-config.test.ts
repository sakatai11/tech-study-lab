import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

type WranglerConfig = {
  name: string
  main: string
  compatibility_date: string
  compatibility_flags: string[]
  services?: Array<{ binding: string; service: string; entrypoint: string }>
  migrations?: unknown
  durable_objects?: unknown
  r2_buckets?: unknown
  assets?: { binding: string; directory: string; run_worker_first?: string[] }
  env?: Record<string, Partial<WranglerConfig>>
  observability?: { enabled: boolean; head_sampling_rate: number }
  preview_urls?: boolean
  workers_dev?: boolean
  account_id?: string
  d1_databases?: Array<{ binding: string; database_name: string; database_id: string }>
  ratelimits?: Array<{ name: string; namespace_id: string }>
  vars?: Record<string, string>
}

function readJsonc(url: URL): WranglerConfig {
  const source = readFileSync(url, 'utf8').replace(/^\s*\/\/.*$/gm, '')
  return JSON.parse(source) as WranglerConfig
}

describe('Vinext Cloudflare configuration', () => {
  const vinextConfig = readJsonc(new URL('../wrangler.vinext.jsonc', import.meta.url))
  const openNextConfig = readJsonc(new URL('../wrangler.jsonc', import.meta.url))

  it('uses an isolated Worker with no production migration history', () => {
    expect(vinextConfig.name).toBe('tech-study-lab-web-vinext-local')
    expect(vinextConfig.name).not.toBe(openNextConfig.name)
    expect(vinextConfig.name).not.toBe(vinextConfig.env?.edge?.name)
    expect(vinextConfig.workers_dev).toBe(false)
    expect(vinextConfig.preview_urls).toBe(false)
    expect(vinextConfig.main).toBe('vinext/server/fetch-handler')
    expect(vinextConfig.services).toEqual([
      { binding: 'API', service: 'tech-study-lab-api', entrypoint: 'InternalApi' },
    ])
    expect(vinextConfig.migrations).toBeUndefined()
    expect(vinextConfig.durable_objects).toBeUndefined()
    expect(vinextConfig.r2_buckets).toBeUndefined()
  })

  it('keeps shared compatibility settings and serves built client assets', () => {
    expect(vinextConfig.compatibility_date).toBe(openNextConfig.compatibility_date)
    expect(vinextConfig.compatibility_flags).toEqual([
      ...openNextConfig.compatibility_flags,
      'enable_weak_ref',
    ])
    expect(vinextConfig.assets).toMatchObject({ binding: 'ASSETS', directory: 'dist/client' })
  })

  it('routes private static cache artifacts through the Worker', () => {
    expect(vinextConfig.assets?.run_worker_first).toContain('/_vinext/static-cache/*')
  })

  it('isolates edge verification from the production API and disables preview URLs', () => {
    const edge = vinextConfig.env?.edge

    expect(edge?.name).toBe('tech-study-lab-web-vinext')
    expect(edge?.services).toEqual([
      { binding: 'API', service: 'tech-study-lab-api-vinext', entrypoint: 'InternalApi' },
    ])
    expect(edge?.services?.some(({ service }) => service === 'tech-study-lab-api')).toBe(false)
    expect(edge?.observability).toEqual({ enabled: true, head_sampling_rate: 1 })
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

  it('registers the OpenNext alias before the Cloudflare plugin', () => {
    const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
    const aliasPluginIndex = viteConfig.indexOf('openNextCloudflareAlias()')
    const cloudflarePluginIndex = viteConfig.indexOf('cloudflare(')

    expect(aliasPluginIndex).toBeGreaterThanOrEqual(0)
    expect(cloudflarePluginIndex).toBeGreaterThan(aliasPluginIndex)
  })

  it('enables the Vinext runtime only in its scripts and skips the OpenNext dev proxy', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> }
    const nextConfig = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8')

    expect(packageJson.scripts.build).toBe('next build')
    expect(packageJson.scripts.preview).toBe(
      'pnpm content:generate && opennextjs-cloudflare build && opennextjs-cloudflare preview',
    )
    expect(packageJson.scripts.deploy).toBe(
      'pnpm content:generate && opennextjs-cloudflare build && opennextjs-cloudflare deploy',
    )

    for (const scriptName of ['build', 'preview', 'deploy'] as const) {
      const script = packageJson.scripts[scriptName] ?? ''
      expect(script).not.toMatch(/VINEXT|dist\/server/)
    }

    expect(packageJson.scripts['dev:vinext']).toContain('VINEXT=1')
    expect(packageJson.scripts['build:vinext']).toContain('VINEXT=1')
    expect(nextConfig).toMatch(/if\s*\(!process\.env\.VINEXT\)\s*initOpenNextCloudflareForDev\(\)/)

    const buildCommand = packageJson.scripts['build:vinext'] ?? ''
    expect(buildCommand).toContain('node scripts/build-vinext.mjs')
    expect(packageJson.scripts['start:vinext']).toContain('--config dist/server/wrangler.json')
    expect(packageJson.scripts['deploy:vinext']).toBe('node scripts/deploy-vinext.mjs')
  })
})
