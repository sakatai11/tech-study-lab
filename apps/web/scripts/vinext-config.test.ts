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
  assets?: { binding: string; directory: string }
}

function readJsonc(url: URL): WranglerConfig {
  const source = readFileSync(url, 'utf8').replace(/^\s*\/\/.*$/gm, '')
  return JSON.parse(source) as WranglerConfig
}

describe('Vinext Cloudflare configuration', () => {
  const vinextConfig = readJsonc(new URL('../wrangler.vinext.jsonc', import.meta.url))
  const openNextConfig = readJsonc(new URL('../wrangler.jsonc', import.meta.url))

  it('uses an isolated Worker with no production migration history', () => {
    expect(vinextConfig.name).toBe('tech-study-lab-web-vinext')
    expect(vinextConfig.name).not.toBe(openNextConfig.name)
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
    const viteBuildIndex = buildCommand.indexOf('VINEXT=1 vite build')
    const cleanupIndex = buildCommand.indexOf(
      `require('node:fs').rmSync('.wrangler/deploy/config.json',{force:true})`,
    )

    expect(viteBuildIndex).toBeGreaterThanOrEqual(0)
    expect(cleanupIndex).toBeGreaterThan(viteBuildIndex)
    expect(packageJson.scripts['start:vinext']).toContain('--config dist/server/wrangler.json')
    expect(packageJson.scripts['deploy:vinext']).toContain('--config dist/server/wrangler.json')
  })
})
