import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const rebuildMessage =
  'deploy:vinext requires a build with CLOUDFLARE_ENV=edge and the verification API URL.'

try {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--dry-run')) {
    throw new Error(
      'deploy:vinext only accepts --dry-run; deployment target overrides are forbidden.',
    )
  }

  let config
  try {
    config = JSON.parse(
      readFileSync(new URL('../dist/server/wrangler.json', import.meta.url), 'utf8'),
    )
  } catch {
    throw new Error(rebuildMessage)
  }

  const api = config?.services?.[0]
  if (
    config?.name !== 'tech-study-lab-web-vinext' ||
    !Array.isArray(config.services) ||
    config.services.length !== 1 ||
    api?.binding !== 'API' ||
    api?.service !== 'tech-study-lab-api-vinext' ||
    api?.entrypoint !== 'InternalApi' ||
    config.workers_dev !== true ||
    config.preview_urls !== false
  ) {
    throw new Error(rebuildMessage)
  }

  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
      'deploy',
      '--config',
      'dist/server/wrangler.json',
      ...args,
    ],
    { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit' },
  )
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Vinext deployment failed.')
  process.exitCode = 1
}
