import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  scripts: Record<string, string>
}
const productionConfig = {
  name: 'tech-study-lab-web',
  services: [
    {
      binding: 'API',
      service: 'tech-study-lab-api',
      entrypoint: 'InternalApi',
    },
  ],
  migrations: [
    { tag: 'v1', new_sqlite_classes: ['DOQueueHandler'] },
    { tag: 'v2', deleted_classes: ['DOQueueHandler'] },
  ],
}
const edgeConfig = {
  name: 'tech-study-lab-web-vinext',
  services: [
    {
      binding: 'API',
      service: 'tech-study-lab-api-vinext',
      entrypoint: 'InternalApi',
    },
  ],
  migrations: [],
  workers_dev: true,
  preview_urls: false,
}
const apiBaseUrl = 'https://api.example.com'

type DeployOptions = {
  script?: 'deploy' | 'deploy:edge'
  args?: string[]
  buildStatus?: number
  wranglerStatus?: number
  env?: Record<string, string | undefined>
}

// The build stub records CLOUDFLARE_ENV and writes the given config as the generated output.
function runDeploy(config: unknown, options: DeployOptions = {}) {
  const {
    script = 'deploy',
    args = [],
    buildStatus = 0,
    wranglerStatus = 0,
    env = { NEXT_PUBLIC_API_BASE_URL: apiBaseUrl },
  } = options
  const directory = mkdtempSync(join(tmpdir(), 'tsl-web-deploy-'))
  try {
    mkdirSync(join(directory, 'scripts'), { recursive: true })
    mkdirSync(join(directory, 'node_modules/wrangler/bin'), {
      recursive: true,
    })
    copyFileSync(new URL('./deploy.mjs', import.meta.url), join(directory, 'scripts/deploy.mjs'))
    writeFileSync(join(directory, 'generated.json'), JSON.stringify(config ?? null))
    writeFileSync(
      join(directory, 'scripts/build-stub.cjs'),
      `
      const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
      writeFileSync('build-env.json', JSON.stringify({ cloudflareEnv: process.env.CLOUDFLARE_ENV ?? null }))
      const config = JSON.parse(readFileSync('generated.json', 'utf8'))
      if (config) {
        mkdirSync('dist/server', { recursive: true })
        writeFileSync('dist/server/wrangler.json', JSON.stringify(config))
      }
      process.exit(${buildStatus})
    `,
    )
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({
        type: 'module',
        scripts: {
          build: 'node scripts/build-stub.cjs',
          deploy: packageJson.scripts.deploy,
          'deploy:edge': packageJson.scripts['deploy:edge'],
        },
      }),
    )
    writeFileSync(
      join(directory, 'node_modules/wrangler/bin/wrangler.js'),
      `
      const { writeFileSync } = require('node:fs')
      writeFileSync('wrangler-invocation.json', JSON.stringify(process.argv.slice(2)))
      process.exit(${wranglerStatus})
    `,
    )
    const childEnv: Record<string, string | undefined> = {
      ...process.env,
      NEXT_PUBLIC_API_BASE_URL: undefined,
      CLOUDFLARE_ENV: undefined,
      ...env,
    }
    for (const key of Object.keys(childEnv)) {
      if (childEnv[key] === undefined) delete childEnv[key]
    }
    const result = spawnSync('pnpm', ['run', script, ...args], {
      cwd: directory,
      encoding: 'utf8',
      env: childEnv as NodeJS.ProcessEnv,
    })
    expect(result.error).toBeUndefined()
    const readJson = (name: string) => {
      const path = join(directory, name)
      return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined
    }
    return {
      status: result.status,
      stderr: result.stderr,
      build: readJson('build-env.json') as { cloudflareEnv: string | null } | undefined,
      invocation: readJson('wrangler-invocation.json') as string[] | undefined,
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('Web deploy command', () => {
  it.each([
    {
      script: 'deploy' as const,
      config: productionConfig,
      cloudflareEnv: null,
    },
    {
      script: 'deploy:edge' as const,
      config: edgeConfig,
      cloudflareEnv: 'edge',
    },
  ])(
    'builds $script for its own environment and deploys the generated config',
    ({ script, config, cloudflareEnv }) => {
      const result = runDeploy(config, {
        script,
        env: { NEXT_PUBLIC_API_BASE_URL: apiBaseUrl, CLOUDFLARE_ENV: 'other' },
      })

      expect(result.status, result.stderr).toBe(0)
      expect(result.build).toEqual({ cloudflareEnv })
      expect(result.invocation).toEqual(['deploy', '--config', 'dist/server/wrangler.json'])
    },
  )

  it('passes --dry-run through to Wrangler', () => {
    const result = runDeploy(productionConfig, { args: ['--dry-run'] })

    expect(result.status, result.stderr).toBe(0)
    expect(result.invocation).toEqual([
      'deploy',
      '--config',
      'dist/server/wrangler.json',
      '--dry-run',
    ])
  })

  it.each([
    {
      script: 'deploy' as const,
      config: undefined,
      reason: 'missing build output',
    },
    {
      script: 'deploy' as const,
      config: edgeConfig,
      reason: 'edge build to production',
    },
    {
      script: 'deploy' as const,
      config: { ...productionConfig, migrations: [] },
      reason: 'production build without migration history',
    },
    {
      script: 'deploy:edge' as const,
      config: productionConfig,
      reason: 'production build to edge',
    },
    {
      script: 'deploy:edge' as const,
      config: { ...edgeConfig, migrations: productionConfig.migrations },
      reason: 'edge build inheriting production migrations',
    },
    {
      script: 'deploy:edge' as const,
      config: {
        ...edgeConfig,
        services: [...edgeConfig.services, { binding: 'OTHER', service: 'tech-study-lab-api' }],
      },
      reason: 'extra binding',
    },
    {
      script: 'deploy:edge' as const,
      config: { ...edgeConfig, workers_dev: false },
      reason: 'disabled verification hostname',
    },
    {
      script: 'deploy:edge' as const,
      config: { ...edgeConfig, preview_urls: true },
      reason: 'unprotected preview URL',
    },
  ])('rejects $reason before invoking Wrangler', ({ script, config }) => {
    const result = runDeploy(config, { script })

    expect(result.status).toBe(1)
    expect(result.invocation).toBeUndefined()
    expect(result.stderr).toContain('generated config does not match')
  })

  it.each([
    { env: {}, reason: 'missing' },
    {
      env: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:8787' },
      reason: 'non-https',
    },
  ])('rejects a $reason public API URL before building', ({ env }) => {
    const result = runDeploy(productionConfig, { env })

    expect(result.status).toBe(1)
    expect(result.build).toBeUndefined()
    expect(result.invocation).toBeUndefined()
    expect(result.stderr).toContain('NEXT_PUBLIC_API_BASE_URL')
  })

  it('preserves a build failure without invoking Wrangler', () => {
    const result = runDeploy(productionConfig, { buildStatus: 42 })

    expect(result.status).toBe(42)
    expect(result.invocation).toBeUndefined()
  })

  it('preserves a Wrangler failure', () => {
    expect(runDeploy(productionConfig, { wranglerStatus: 42 }).status).toBe(42)
  })

  it.each([
    { args: ['--name', 'tech-study-lab-web'] },
    { args: ['--config', 'wrangler.jsonc'] },
    { args: ['--env', 'edge'] },
  ])('rejects CLI overrides $args before building', ({ args }) => {
    const result = runDeploy(productionConfig, { args })

    expect(result.status).toBe(1)
    expect(result.build).toBeUndefined()
    expect(result.invocation).toBeUndefined()
  })
})
