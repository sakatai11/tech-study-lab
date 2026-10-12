import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
    name: 'tech-study-lab-web-test',
    apiService: 'tech-study-lab-api-test',
    migrations: [],
    workersDev: true,
    previewUrls: false,
  },
}

const rootUrl = new URL('../', import.meta.url)
const root = fileURLToPath(rootUrl)
const [targetName, ...options] = process.argv.slice(2)
const prepareOnly = options.includes('--prepare-only')
const uploadOnly = options.includes('--upload-only')
const args = options.filter((option) => option === '--dry-run')

function buildDigest(directory, prefix = '') {
  const hash = createHash('sha256')
  for (const name of readdirSync(join(directory, prefix)).sort()) {
    const relative = join(prefix, name)
    if (relative === 'deploy-target.json') continue
    const path = join(directory, relative)
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) throw new Error('symlinks are forbidden in deploy artifacts')
    hash.update(relative)
    hash.update(stat.isDirectory() ? buildDigest(directory, relative) : readFileSync(path))
  }
  return hash.digest('hex')
}

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
  if (
    options.some((option) => !['--dry-run', '--prepare-only', '--upload-only'].includes(option)) ||
    new Set(options).size !== options.length ||
    (prepareOnly && uploadOnly)
  ) {
    throw new Error(
      'deploy accepts --dry-run and one of --prepare-only / --upload-only; target overrides are forbidden.',
    )
  }

  // The browser calls this URL directly, so it must be the target's own API Worker:
  // https://<api Worker name>.<account subdomain>.workers.dev with no path.
  const apiUrlMessage = `NEXT_PUBLIC_API_BASE_URL must be https://${target.apiService}.<subdomain>.workers.dev for the ${targetName} deploy target.`
  let apiUrl
  try {
    apiUrl = new URL(process.env.NEXT_PUBLIC_API_BASE_URL ?? '')
  } catch {
    throw new Error(apiUrlMessage)
  }
  const [workerName, ...domainLabels] = apiUrl.hostname.split('.')
  if (
    apiUrl.protocol !== 'https:' ||
    apiUrl.port !== '' ||
    apiUrl.username !== '' ||
    apiUrl.password !== '' ||
    apiUrl.pathname !== '/' ||
    apiUrl.search !== '' ||
    apiUrl.hash !== '' ||
    workerName !== target.apiService ||
    domainLabels.length !== 3 ||
    domainLabels.slice(1).join('.') !== 'workers.dev'
  ) {
    throw new Error(apiUrlMessage)
  }

  // The target selects the Wrangler env only at build time; a caller's CLOUDFLARE_ENV is dropped.
  // The generated config is already flattened for that env, so deploy runs without any env:
  // passing one would make Wrangler look up a missing section and rename the Worker.
  const { CLOUDFLARE_ENV: _callerEnv, ...deployEnv } = process.env
  const buildEnv = target.cloudflareEnv
    ? { ...deployEnv, CLOUDFLARE_ENV: target.cloudflareEnv }
    : deployEnv
  const buildStatus = uploadOnly ? 0 : run('pnpm', ['run', 'build'], buildEnv)
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

    const receiptPath = new URL('dist/deploy-target.json', rootUrl)
    const receipt = {
      targetName,
      apiUrl: apiUrl.origin,
      digest: buildDigest(fileURLToPath(new URL('dist/', rootUrl))),
    }
    if (uploadOnly) {
      if (!sameJson(JSON.parse(readFileSync(receiptPath, 'utf8')), receipt)) {
        throw new Error('prepared Web artifact does not match target, URL, or hash')
      }
    } else {
      writeFileSync(receiptPath, JSON.stringify(receipt))
    }

    if (!prepareOnly)
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
