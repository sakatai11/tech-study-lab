import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'jsonc-parser'
import { getTarget } from './deployment-lib.mjs'

const source = fileURLToPath(new URL('../', import.meta.url))

test('actual plan/prepare CLIs skip docs, recover unfinished mutations, and build only selected Workers [ADR-0017] [ADR-0018]', () => {
  for (const environment of ['verification', 'production']) {
    for (const scope of ['api', 'web', 'shared', 'docs', 'recovery']) {
      const target = getTarget(environment)
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'tsl-prepare-')))
      const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
      const put = (path, value) =>
        writeFileSync(join(root, path), typeof value === 'string' ? value : JSON.stringify(value))
      try {
        for (const directory of [
          'scripts',
          'bin',
          'content',
          'docs',
          'packages/shared',
          'apps/api/drizzle/migrations',
          'apps/web/src',
        ])
          mkdirSync(join(root, directory), { recursive: true })
        for (const name of [
          'deployment.mjs',
          'deployment-lib.mjs',
          'deployment-plan.mjs',
          'deployment-changes.mjs',
          'deployment-smoke.mjs',
          'performance.mjs',
          'performance-lib.mjs',
        ])
          cpSync(join(source, 'scripts', name), join(root, 'scripts', name))
        symlinkSync(join(source, 'node_modules'), join(root, 'node_modules'), 'dir')
        cpSync(join(source, target.apiConfig), join(root, target.apiConfig))
        cpSync(join(source, 'apps/web/wrangler.jsonc'), join(root, 'apps/web/wrangler.jsonc'))
        put('content/example.md', 'content')
        put('apps/api/drizzle/migrations/0000.sql', 'SELECT 1;')
        git('init', '-q', '-b', target.branch)
        git('add', 'content', 'apps')
        git(
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@example.invalid',
          'commit',
          '-qm',
          'base',
        )
        const previous = {
          sha: git('rev-parse', 'HEAD'),
          tree: git('rev-parse', 'HEAD^{tree}'),
          apiVersion: 'api-1',
          webVersion: 'web-1',
        }
        const changed = {
          api: 'apps/api/change.ts',
          web: 'apps/web/src/change.ts',
          shared: 'packages/shared/change.ts',
          docs: 'docs/change.md',
          recovery: 'docs/change.md',
        }[scope]
        put(changed, 'change')
        git('add', changed)
        git(
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@example.invalid',
          'commit',
          '-qm',
          'change',
        )
        const sha = git('rev-parse', 'HEAD')
        put(
          'network.mjs',
          `globalThis.fetch = async (url) => Response.json(String(url).includes('/statuses') ? [{state:'success'}] : [${scope === 'recovery' ? '{id:2,payload:{kind:"tsl-attempt"}},' : ''}{id:1,sha:${JSON.stringify(previous.sha)},payload:${JSON.stringify({ kind: 'tsl-release', tree: previous.tree, apiVersion: previous.apiVersion, webVersion: previous.webVersion })}}]);`,
        )
        const { env: environments, ...baseWeb } = parse(
          readFileSync(join(root, 'apps/web/wrangler.jsonc'), 'utf8'),
        )
        const builtWeb = {
          ...baseWeb,
          ...(environment === 'verification' ? environments.edge : {}),
          main: 'index.js',
          assets: { directory: '../client' },
        }
        put(
          'bin/pnpm',
          `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync('commands.jsonl', JSON.stringify(args) + String.fromCharCode(10));
if (args.includes('scripts/prepare-content.ts')) {
  const output = args[args.indexOf('scripts/prepare-content.ts') + 1];
  fs.mkdirSync(output, {recursive:true});
  fs.writeFileSync(path.join(output,'sync.sql'),'SELECT 1;');
  fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify({questionCount:1,smokeQuestion:'q',smokeLesson:'lesson'}));
}
if (args.includes('scripts/deploy.mjs')) {
  fs.mkdirSync('apps/web/dist/server', {recursive:true});
  fs.mkdirSync('apps/web/dist/client', {recursive:true});
  fs.writeFileSync('apps/web/dist/server/wrangler.json',${JSON.stringify(JSON.stringify(builtWeb))});
  fs.writeFileSync('apps/web/dist/server/index.js','web bundle');
}
if (args.includes('--outdir')) fs.writeFileSync(path.join(args[args.indexOf('--outdir') + 1], 'index.js'), 'api bundle');
`,
        )
        chmodSync(join(root, 'bin/pnpm'), 0o755)
        const env = {
          PATH: `${join(root, 'bin')}:${process.env.PATH}`,
          GITHUB_REF: `refs/heads/${target.branch}`,
          GITHUB_SHA: sha,
          GITHUB_EVENT_NAME: 'push',
          GITHUB_REPOSITORY: 'test/fixture',
          GITHUB_RUN_ID: 'fixture',
          GITHUB_TOKEN: 'fake',
          DEPLOY_ACCOUNT_SUBDOMAIN: 'fixture',
          GITHUB_OUTPUT: join(root, 'outputs'),
        }
        const run = (script, extraEnv = {}) => {
          const args = script === 'deployment.mjs' ? ['prepare', environment] : [environment]
          const result = spawnSync(
            process.execPath,
            ['--import', join(root, 'network.mjs'), join(root, 'scripts', script), ...args],
            { cwd: root, encoding: 'utf8', env: { ...env, ...extraEnv } },
          )
          assert.equal(result.status, 0, result.stdout + result.stderr)
        }
        run('deployment-plan.mjs')
        const outputs = readFileSync(join(root, 'outputs'), 'utf8')
        const plan = JSON.parse(
          outputs
            .split(String.fromCharCode(10))
            .find((line) => line.startsWith('plan='))
            .slice(5),
        )
        const workers = {
          api: ['api', 'shared', 'recovery'].includes(scope),
          web: ['web', 'shared', 'recovery'].includes(scope),
        }
        assert.deepEqual(plan.workers, workers)
        assert(outputs.includes(`deploy=${scope !== 'docs'}`))
        assert(!existsSync(join(root, 'commands.jsonl')), 'planning never builds')
        if (scope === 'docs') {
          run('deployment-plan.mjs', { FORCE_FULL: 'true' })
          const forced = JSON.parse(
            readFileSync(join(root, 'outputs'), 'utf8')
              .trim()
              .split(String.fromCharCode(10))
              .at(-1)
              .slice(5),
          )
          assert.deepEqual(forced.workers, { api: true, web: true })
          continue
        }
        run('deployment.mjs', { DEPLOY_PLAN_JSON: JSON.stringify(plan) })
        const commands = readFileSync(join(root, 'commands.jsonl'), 'utf8')
          .trim()
          .split(String.fromCharCode(10))
          .map(JSON.parse)
        assert.equal(
          commands.some((args) => args.includes('--dry-run')),
          workers.api,
        )
        assert.equal(
          commands.some((args) => args.includes('scripts/deploy.mjs')),
          workers.web,
        )
        assert.equal(
          commands.some((args) => args.includes('verify:build')),
          workers.web,
        )
        const manifest = JSON.parse(
          readFileSync(join(root, '.deploy/release/manifest.json'), 'utf8'),
        )
        assert.deepEqual(manifest.plan, plan)
        assert.equal(Object.hasOwn(manifest.files, 'api/index.js'), workers.api)
        assert.equal(Object.hasOwn(manifest.files, 'web/server/index.js'), workers.web)
        assert(
          Object.hasOwn(manifest.files, 'content/sync.sql'),
          'D1 sync is retained for partial releases',
        )
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  }
})
