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
const edgeConfig = {
  name: 'tech-study-lab-web-vinext',
  services: [{ binding: 'API', service: 'tech-study-lab-api-vinext', entrypoint: 'InternalApi' }],
  workers_dev: true,
  preview_urls: false,
}

function runDeploy(config: unknown, args: string[] = [], exitStatus = 0) {
  const directory = mkdtempSync(join(tmpdir(), 'tsl-vinext-deploy-'))
  try {
    mkdirSync(join(directory, 'scripts'), { recursive: true })
    mkdirSync(join(directory, 'dist/server'), { recursive: true })
    mkdirSync(join(directory, 'node_modules/wrangler/bin'), { recursive: true })
    copyFileSync(
      new URL('./deploy-vinext.mjs', import.meta.url),
      join(directory, 'scripts/deploy-vinext.mjs'),
    )
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({
        type: 'module',
        scripts: { 'deploy:vinext': packageJson.scripts['deploy:vinext'] },
      }),
    )
    if (config !== undefined) {
      writeFileSync(join(directory, 'dist/server/wrangler.json'), JSON.stringify(config))
    }
    writeFileSync(
      join(directory, 'node_modules/wrangler/bin/wrangler.js'),
      `
      const { writeFileSync } = require('node:fs')
      writeFileSync('wrangler-invocation.json', JSON.stringify(process.argv.slice(2)))
      process.exit(${exitStatus})
    `,
    )
    const result = spawnSync('pnpm', ['run', 'deploy:vinext', ...args], {
      cwd: directory,
      encoding: 'utf8',
    })
    expect(result.error).toBeUndefined()
    const invocationPath = join(directory, 'wrangler-invocation.json')
    return {
      status: result.status,
      stderr: result.stderr,
      invocation: existsSync(invocationPath)
        ? (JSON.parse(readFileSync(invocationPath, 'utf8')) as string[])
        : undefined,
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('Vinext deploy command', () => {
  it.each([
    { config: undefined, reason: 'missing build' },
    { config: { ...edgeConfig, name: 'tech-study-lab-web-vinext-local' }, reason: 'local build' },
    {
      config: {
        ...edgeConfig,
        services: [{ binding: 'API', service: 'tech-study-lab-api', entrypoint: 'InternalApi' }],
      },
      reason: 'old production binding',
    },
    { config: { ...edgeConfig, services: [] }, reason: 'missing API binding' },
    {
      config: {
        ...edgeConfig,
        services: [...edgeConfig.services, { binding: 'OTHER', service: 'tech-study-lab-api' }],
      },
      reason: 'extra binding',
    },
    { config: { ...edgeConfig, workers_dev: false }, reason: 'disabled verification hostname' },
    { config: { ...edgeConfig, preview_urls: true }, reason: 'unprotected preview URL' },
  ])('rejects $reason before invoking Wrangler', ({ config }) => {
    const result = runDeploy(config)
    expect(result.status).toBe(1)
    expect(result.invocation).toBeUndefined()
    expect(result.stderr).toContain('CLOUDFLARE_ENV=edge')
  })

  it.each([{ args: [] }, { args: ['--dry-run'] }])(
    'deploys the verified config with arguments $args',
    ({ args }) => {
      const result = runDeploy(edgeConfig, args)
      expect(result.status, result.stderr).toBe(0)
      expect(result.invocation).toEqual([
        'deploy',
        '--config',
        'dist/server/wrangler.json',
        ...args,
      ])
    },
  )

  it('preserves a Wrangler failure', () => {
    expect(runDeploy(edgeConfig, [], 42).status).toBe(42)
  })

  it.each([
    { args: ['--name', 'tech-study-lab-web'] },
    { args: ['--config', 'wrangler.jsonc'] },
    { args: ['--env', 'production'] },
  ])('rejects CLI overrides $args before invoking Wrangler', ({ args }) => {
    const result = runDeploy(edgeConfig, args)
    expect(result.status).toBe(1)
    expect(result.invocation).toBeUndefined()
  })
})
