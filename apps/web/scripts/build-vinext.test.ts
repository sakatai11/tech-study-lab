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
) as { scripts: Record<string, string> }

describe('Vinext build command', () => {
  it.each([0, 42])(
    'removes the deploy redirect and preserves Vite exit status %i',
    (exitStatus) => {
      const directory = mkdtempSync(join(tmpdir(), 'tsl-vinext-build-'))
      const redirectPath = join(directory, '.wrangler/deploy/config.json')

      try {
        mkdirSync(join(directory, 'scripts'), { recursive: true })
        mkdirSync(join(directory, 'node_modules/.bin'), { recursive: true })
        mkdirSync(join(directory, 'node_modules/vite/bin'), { recursive: true })
        const wrapper = new URL('./build-vinext.mjs', import.meta.url)
        copyFileSync(wrapper, join(directory, 'scripts/build-vinext.mjs'))
        writeFileSync(
          join(directory, 'package.json'),
          JSON.stringify({
            type: 'module',
            scripts: {
              'build:vinext': packageJson.scripts['build:vinext'],
              'content:generate': 'node scripts/generate-content.mjs',
            },
          }),
        )
        writeFileSync(
          join(directory, 'scripts/generate-content.mjs'),
          "import { writeFileSync } from 'node:fs'; writeFileSync('content-generated', '')",
        )
        const viteStub = `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
mkdirSync('.wrangler/deploy', { recursive: true })
writeFileSync('.wrangler/deploy/config.json', JSON.stringify({ configPath: '../../dist/server/wrangler.json' }))
writeFileSync('vite-invocation.json', JSON.stringify({ vinext: process.env.VINEXT, args: process.argv.slice(2) }))
process.exit(${exitStatus})
`
        writeFileSync(join(directory, 'node_modules/vite/bin/vite.js'), viteStub)
        writeFileSync(join(directory, 'node_modules/.bin/vite'), viteStub, { mode: 0o755 })

        const result = spawnSync('pnpm', ['run', 'build:vinext'], {
          cwd: directory,
          encoding: 'utf8',
        })

        expect(result.error).toBeUndefined()
        expect(result.status, result.stderr).toBe(exitStatus)
        expect(existsSync(join(directory, 'content-generated'))).toBe(true)
        expect(JSON.parse(readFileSync(join(directory, 'vite-invocation.json'), 'utf8'))).toEqual({
          vinext: '1',
          args: ['build'],
        })
        expect(existsSync(redirectPath)).toBe(false)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )
})
