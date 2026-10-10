import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

try {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), 'build'],
    { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit' },
  )

  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  // Vite writes this redirect before prerendering. Remove it so a failed or stale build never
  // becomes the implicit target of a later Wrangler command; deploy always passes the config.
  rmSync(new URL('../.wrangler/deploy/config.json', import.meta.url), { force: true })
}
