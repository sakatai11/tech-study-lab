import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Deploy targets are fixed here so that a build for one environment cannot be uploaded to another.
const targets = {
  production: {
    cloudflareEnv: undefined,
    name: 'tech-study-lab-web',
    apiService: 'tech-study-lab-api',
    migrations: [
      { tag: 'v1', new_sqlite_classes: ['DOQueueHandler'] },
      { tag: 'v2', deleted_classes: ['DOQueueHandler'] },
    ],
  },
  edge: {
    cloudflareEnv: 'edge',
    name: 'tech-study-lab-web-vinext',
    apiService: 'tech-study-lab-api-vinext',
    migrations: [],
    workersDev: true,
    previewUrls: false,
  },
}

const rootUrl = new URL('../', import.meta.url)
const root = fileURLToPath(rootUrl)
const [targetName, ...args] = process.argv.slice(2)

function run(command, commandArgs, env = process.env) {
  const result = spawnSync(command, commandArgs, { cwd: root, env, stdio: 'inherit' })
  if (result.error) throw result.error
  return result.status ?? 1
}

function sameJson(actual, expected) {
  return JSON.stringify(actual ?? []) === JSON.stringify(expected)
}

try {
  const target = Object.hasOwn(targets, targetName ?? '') ? targets[targetName] : undefined
  if (!target) throw new Error('deploy target must be production or edge.')
  if (args.length > 1 || (args.length === 1 && args[0] !== '--dry-run')) {
    throw new Error('deploy only accepts --dry-run; deployment target overrides are forbidden.')
  }

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''
  if (!apiBaseUrl.startsWith('https://')) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL must be the public https URL of the target API.')
  }

  // The target selects the Wrangler env only at build time; a caller's CLOUDFLARE_ENV is dropped.
  // The generated config is already flattened for that env, so deploy runs without any env:
  // passing one would make Wrangler look up a missing section and rename the Worker.
  const { CLOUDFLARE_ENV: _callerEnv, ...deployEnv } = process.env
  const buildEnv = target.cloudflareEnv
    ? { ...deployEnv, CLOUDFLARE_ENV: target.cloudflareEnv }
    : deployEnv
  const buildStatus = run('pnpm', ['run', 'build'], buildEnv)
  if (buildStatus !== 0) {
    process.exitCode = buildStatus
  } else {
    const rebuildMessage = `generated config does not match the ${targetName} deploy target.`
    let config
    try {
      config = JSON.parse(readFileSync(new URL('dist/server/wrangler.json', rootUrl), 'utf8'))
    } catch {
      throw new Error(rebuildMessage)
    }

    if (
      config?.name !== target.name ||
      !sameJson(config.services, [
        { binding: 'API', service: target.apiService, entrypoint: 'InternalApi' },
      ]) ||
      !sameJson(config.migrations, target.migrations) ||
      (target.workersDev !== undefined && config.workers_dev !== target.workersDev) ||
      (target.previewUrls !== undefined && config.preview_urls !== target.previewUrls)
    ) {
      throw new Error(rebuildMessage)
    }

    process.exitCode = run(
      process.execPath,
      [
        fileURLToPath(new URL('node_modules/wrangler/bin/wrangler.js', rootUrl)),
        'deploy',
        '--config',
        'dist/server/wrangler.json',
        ...args,
      ],
      deployEnv,
    )
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Web deployment failed.')
  process.exitCode = 1
}
