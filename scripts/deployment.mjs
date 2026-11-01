import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseJsonc } from 'jsonc-parser'
import { parse as parseToml } from 'smol-toml'

import {
  assertDeploymentProtection,
  assertFreshSource,
  assertTargetConfig,
  assertWorkflowContext,
  createManifest,
  deploymentUrls,
  getTarget,
  github,
  lastRelease,
  recordRelease,
  runRelease,
  validateManifest,
} from './deployment-lib.mjs'
import {
  accessHeaders,
  checkApiHealth,
  checkAuthenticatedApi,
  smokeTest,
} from './deployment-smoke.mjs'
import { cpuStage, measureStage, performanceProof, performanceSummary } from './performance.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const release = resolve(root, '.deploy/release')
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

function run(args, extraEnv = {}) {
  const { CLOUDFLARE_ENV: _env, WRANGLER_CI_OVERRIDE_NAME: _name, ...env } = process.env
  execFileSync('pnpm', args, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...env,
      WRANGLER_SEND_METRICS: 'false',
      WRANGLER_WRITE_LOGS: 'false',
      ...extraEnv,
    },
  })
}

function readConfig(path) {
  const source = readFileSync(resolve(root, path), 'utf8')
  if (path.endsWith('.toml')) return parseToml(source)
  const errors = []
  const config = parseJsonc(source, errors)
  assert.equal(errors.length, 0, 'invalid JSONC config')
  return config
}

function context(environment) {
  const target = getTarget(environment)
  assertWorkflowContext(environment, process.env)
  const sha = git('rev-parse', 'HEAD')
  assert.equal(sha, process.env.GITHUB_SHA, 'checkout is not the workflow commit')
  return {
    target,
    sha,
    tree: git('rev-parse', 'HEAD^{tree}'),
    contentTree: git('rev-parse', 'HEAD:content'),
    ...deploymentUrls(target, process.env.DEPLOY_ACCOUNT_SUBDOMAIN),
  }
}

function summary(text) {
  console.info(text)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
}

async function prepare(environment) {
  const ctx = context(environment)
  const { target, sha, tree, contentTree, apiUrl, webUrl } = ctx
  rmSync(release, { recursive: true, force: true })
  mkdirSync(resolve(release, 'api'), { recursive: true })
  const api = readConfig(target.apiConfig)
  const timestamp = Number(git('show', '-s', '--format=%ct', 'HEAD')) * 1000
  run([
    '--filter',
    '@tsl/api',
    'exec',
    'tsx',
    'scripts/prepare-content.ts',
    resolve(release, 'content'),
    String(timestamp),
  ])
  run(
    [
      '--filter',
      '@tsl/web',
      'exec',
      'node',
      'scripts/deploy.mjs',
      target.webTarget,
      '--prepare-only',
    ],
    { NEXT_PUBLIC_API_BASE_URL: apiUrl },
  )
  run(['--filter', '@tsl/web', 'verify:build'])
  const web = readJson(resolve(root, 'apps/web/dist/server/wrangler.json'))
  assertTargetConfig(target, api, web)
  run([
    '--filter',
    '@tsl/api',
    'exec',
    'wrangler',
    'deploy',
    '--config',
    resolve(root, target.apiConfig),
    '--dry-run',
    '--outdir',
    resolve(release, 'api'),
  ])
  cpSync(resolve(root, 'apps/api/drizzle/migrations'), resolve(release, 'api/migrations'), {
    recursive: true,
  })
  writeJson(resolve(release, 'api/wrangler.json'), {
    ...api,
    account_id: target.account,
    main: 'index.js',
    no_bundle: true,
    vars: {},
    d1_databases: api.d1_databases.map((db) => ({ ...db, migrations_dir: 'migrations' })),
  })
  cpSync(resolve(root, 'apps/web/dist'), resolve(release, 'web'), { recursive: true })
  const content = readJson(resolve(release, 'content/summary.json'))
  const previous = await lastRelease(environment)
  const manifest = createManifest(release, {
    environment,
    sha,
    tree,
    contentTree,
    runId: process.env.GITHUB_RUN_ID,
    apiUrl,
    webUrl,
    questionCount: content.questionCount,
    contentChanged: previous?.contentTree !== contentTree,
    baselineSha: previous?.sha ?? null,
    migrations: Object.keys(createManifest(release, {}).files).filter((name) =>
      /^api\/migrations\/.*\.sql$/.test(name),
    ),
  })
  writeJson(resolve(release, 'manifest.json'), manifest)
  summary(
    `## Release plan: ${environment}\n\nCommit: \`${sha}\`\n\nSource tree: \`${tree}\`\n\nWorkers: \`${target.api}\` → \`${target.web}\`\n\nD1: \`${target.database}\` (${target.databaseId})\n\nQuestions: ${manifest.questionCount}; content changed since last success: ${manifest.contentChanged} (D1 sync runs on every release)\n\nSQL SHA-256: \`${manifest.files['content/sync.sql']}\`\n\nMigration files (Wrangler applies only pending files):\n${manifest.migrations.map((name) => `- \`${name}\``).join('\n')}\n\nFull hashes are in manifest.json. Apply automatically uses these exact artifacts after preflight checks. No remote writes have run.`,
  )
}

async function cloudflare(
  target,
  path,
  { method = 'GET', body, token = process.env.CLOUDFLARE_API_TOKEN } = {},
) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${target.account}/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    },
  )
  assert(
    response.ok,
    `Cloudflare ${method === 'GET' ? 'read' : 'query'} failed (${response.status})`,
  )
  const json = await response.json()
  assert.equal(json.success, true, 'Cloudflare read failed')
  return json.result
}

async function currentVersion(target, name) {
  const result = await cloudflare(target, `workers/scripts/${name}/deployments`)
  const deployment = result.deployments[0]
  assert.equal(deployment?.versions.length, 1, 'only single-version deployments are supported')
  assert.equal(deployment.versions[0].percentage, 100)
  return deployment.versions[0].version_id
}

async function protection(environment) {
  const config = await github(`environments/${environment}`)
  const policies = await github(`environments/${environment}/deployment-branch-policies`)
  assertDeploymentProtection(environment, config, policies.branch_policies)
}

function credentials(ctx) {
  assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, ctx.target.account, 'Cloudflare account mismatch')
  assert(process.env.CLOUDFLARE_API_TOKEN, 'Cloudflare API token is missing')
  assert.equal(process.env.WEB_ORIGIN, ctx.webUrl, 'WEB_ORIGIN mismatch')
  const issuer = new URL(process.env.ACCESS_ISSUER)
  assert(
    issuer.protocol === 'https:' &&
      issuer.hostname.endsWith('.cloudflareaccess.com') &&
      issuer.origin === process.env.ACCESS_ISSUER,
    'invalid Access issuer',
  )
  assert.match(
    process.env.ACCESS_AUDIENCE ?? '',
    /^[a-f0-9]{64}$/,
    'Access audience is missing or invalid',
  )
  accessHeaders(process.env)
  if (ctx.target.environment === 'verification')
    assert(
      process.env.CLOUDFLARE_OBSERVABILITY_API_TOKEN,
      'Workers Observability token is missing (required for the performance test)',
    )
}

async function fresh(ctx) {
  const branch = await github(`git/ref/heads/${ctx.target.branch}`)
  const verified =
    ctx.target.environment === 'production' ? await lastRelease('verification') : null
  assertFreshSource(ctx.target.environment, ctx.sha, branch.object.sha, ctx.tree, verified)
  if (verified) {
    const verification = getTarget('verification')
    assert.equal(
      await currentVersion(verification, verification.api),
      verified.apiVersion,
      'verification API changed since successful test',
    )
    assert.equal(
      await currentVersion(verification, verification.web),
      verified.webVersion,
      'verification Web changed since successful test',
    )
  }
}

async function apply(environment) {
  const ctx = context(environment)
  const { target, sha, apiUrl } = ctx
  const manifest = readJson(resolve(release, 'manifest.json'))
  const result = { environment, sha, stage: 'preflight', completed: [], before: {}, after: {} }
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? '1'
  const perf = {}
  let baseline = null
  const apiConfig = resolve(release, 'api/wrangler.json')
  const wrangler = (...args) => run(['--filter', '@tsl/api', 'exec', 'wrangler', ...args])
  const stage = (name, fn) => async () => {
    result.stage = name
    writeJson(resolve(root, '.deploy/result.json'), result)
    summary(`Stage: **${name}**`)
    await fn()
    result.completed.push(name)
    writeJson(resolve(root, '.deploy/result.json'), result)
  }
  try {
    await runRelease(environment, {
      preflight: stage('preflight', async () => {
        validateManifest(release, manifest, environment, sha)
        assert.equal(
          manifest.runId,
          process.env.GITHUB_RUN_ID,
          'artifact must originate in this workflow run',
        )
        assert.equal(manifest.tree, ctx.tree)
        assert.equal(manifest.apiUrl, apiUrl)
        assert.equal(manifest.webUrl, ctx.webUrl)
        assert.equal(process.env.DEPLOY_ENABLED, 'true', 'environment deployment is disabled')
        if (environment === 'production')
          assert.equal(
            process.env.PRODUCTION_VINEXT_READY,
            'true',
            'initial Vinext switch conditions are not satisfied',
          )
        await protection(environment)
        credentials(ctx)
        const subdomain = await cloudflare(target, 'workers/subdomain')
        assert.equal(
          subdomain.subdomain,
          process.env.DEPLOY_ACCOUNT_SUBDOMAIN,
          'workers.dev subdomain mismatch',
        )
        assertTargetConfig(
          target,
          readJson(apiConfig),
          readJson(resolve(release, 'web/server/wrangler.json')),
        )
        assert.equal(readJson(apiConfig).main, 'index.js')
        assert.equal(readJson(apiConfig).no_bundle, true)
        assert.equal(readJson(resolve(release, 'web/server/wrangler.json')).main, 'index.js')
        assert.equal(
          readJson(resolve(release, 'web/server/wrangler.json')).assets?.directory,
          '../client',
        )
        const database = await cloudflare(target, `d1/database/${target.databaseId}`)
        assert.equal(database.name, target.database, 'remote D1 name mismatch')
        await fresh(ctx)
        await checkAuthenticatedApi(apiUrl)
        // A failed run may have synced D1 without recording success, so the last
        // success record cannot prove D1 matches this content. Always re-sync.
        result.contentSync = true
        // 比較の基準は直前の成功記録。性能試験を持たない記録は基準にしない。
        if (environment === 'verification')
          baseline = (await lastRelease(environment))?.performance ?? null
        result.before.api = await currentVersion(target, target.api)
        result.before.web = await currentVersion(target, target.web)
        rmSync(resolve(root, 'apps/web/dist'), { recursive: true, force: true })
        cpSync(resolve(release, 'web'), resolve(root, 'apps/web/dist'), { recursive: true })
      }),
      migrations: stage('migrations', async () =>
        wrangler('d1', 'migrations', 'apply', target.database, '--remote', '--config', apiConfig),
      ),
      sync: stage('sync', async () => {
        wrangler(
          'd1',
          'execute',
          target.database,
          '--remote',
          '--config',
          apiConfig,
          '--file',
          resolve(release, 'content/sync.sql'),
          '--yes',
        )
      }),
      api: stage('api', async () => {
        wrangler(
          'deploy',
          '--config',
          apiConfig,
          '--no-bundle',
          '--var',
          `WEB_ORIGIN:${process.env.WEB_ORIGIN}`,
          '--var',
          `ACCESS_ISSUER:${process.env.ACCESS_ISSUER}`,
          '--var',
          `ACCESS_AUDIENCE:${process.env.ACCESS_AUDIENCE}`,
          '--message',
          `Issue #36 ${sha}`,
        )
        result.after.api = await currentVersion(target, target.api)
      }),
      apiHealth: stage('apiHealth', async () => checkApiHealth(apiUrl)),
      web: stage('web', async () => {
        run(
          [
            '--filter',
            '@tsl/web',
            'exec',
            'node',
            'scripts/deploy.mjs',
            target.webTarget,
            '--upload-only',
          ],
          { NEXT_PUBLIC_API_BASE_URL: apiUrl },
        )
        result.after.web = await currentVersion(target, target.web)
      }),
      smoke: stage('smoke', async () =>
        smokeTest(target, ctx, readJson(resolve(release, 'content/summary.json'))),
      ),
      performance: stage('performance', async () =>
        measureStage({
          state: perf,
          target,
          versions: result.after,
          liveVersion: (worker) => currentVersion(target, target[worker]),
          cloudflare: (path, options) => cloudflare(target, path, options),
          headers: accessHeaders(process.env),
          webUrl: ctx.webUrl,
        }),
      ),
      cpuLogs: stage('cpuLogs', async () => {
        await cpuStage({
          state: perf,
          target,
          versions: result.after,
          liveVersion: (worker) => currentVersion(target, target[worker]),
          observe: (body) =>
            cloudflare(target, 'workers/observability/telemetry/query', {
              method: 'POST',
              body,
              token: process.env.CLOUDFLARE_OBSERVABILITY_API_TOKEN,
            }),
          baseline,
          sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
        })
        result.performance = {
          status: perf.status,
          warnings: perf.comparison.warnings.length,
          comparison: perf.comparison.status,
        }
      }),
      record: stage('record', async () => {
        await recordRelease(environment, sha, {
          kind: 'tsl-release',
          tree: ctx.tree,
          contentTree: ctx.contentTree,
          runId: process.env.GITHUB_RUN_ID,
          runAttempt,
          apiVersion: result.after.api,
          webVersion: result.after.web,
          ...(environment === 'verification'
            ? {
                performance: performanceProof(perf, {
                  tree: ctx.tree,
                  runId: process.env.GITHUB_RUN_ID,
                  runAttempt,
                }),
              }
            : {}),
        })
        result.success = true
      }),
    })
  } finally {
    if (perf.status) {
      // 失敗時も取得できた部分結果を残す。応答本文・認証情報・ログ本文は含めない。
      writeJson(resolve(root, '.deploy/performance.json'), {
        environment,
        sha,
        tree: ctx.tree,
        runId: process.env.GITHUB_RUN_ID,
        runAttempt,
        ...perf,
      })
      summary(performanceSummary(perf))
    }
    summary(
      `Result: **${result.success ? 'success' : 'failed'}**; last stage: **${result.stage}**\n\nWorker versions: \`${JSON.stringify({ before: result.before, after: result.after })}\`\n\nOn failure, inspect result.json and live versions before retrying. Retry the whole workflow to regenerate its plan. Worker rollback does not restore D1; see docs/deployment.md.`,
    )
  }
}

async function rollback(environment, worker, version, expected) {
  const ctx = context(environment)
  const { target } = ctx
  assert(['api', 'web'].includes(worker), 'rollback worker must be api or web')
  for (const id of [version, expected])
    assert.match(
      id ?? '',
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,
      'explicit version IDs required',
    )
  await protection(environment)
  credentials(ctx)
  assert.equal(
    await currentVersion(target, target[worker]),
    expected,
    'live version changed since rollback request',
  )
  await cloudflare(target, `workers/scripts/${target[worker]}/versions/${version}`)
  run([
    '--filter',
    '@tsl/api',
    'exec',
    'wrangler',
    'rollback',
    version,
    '--name',
    target[worker],
    '--config',
    resolve(root, target.apiConfig),
    '--yes',
    '--message',
    `Issue #36 manual rollback from ${expected}`,
  ])
  assert.equal(
    await currentVersion(target, target[worker]),
    version,
    'rollback did not activate the expected version',
  )
  await recordRelease(environment, ctx.sha, {
    kind: 'tsl-rollback',
    worker: target[worker],
    version,
    runId: process.env.GITHUB_RUN_ID,
  })
  summary(
    `Rollback verified: ${target[worker]} → ${version}. D1 has not been restored. Prior release proof is invalidated; revalidate before the next production release.`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, environment, ...args] = process.argv.slice(2)
    if (command === 'prepare' && args.length === 0) await prepare(environment)
    else if (command === 'apply' && args.length === 0) await apply(environment)
    else if (command === 'rollback' && args.length === 3) await rollback(environment, ...args)
    else
      throw new Error(
        'usage: deployment.mjs prepare|apply <environment>; rollback <environment> api|web <version> <expected-current-version>',
      )
  } catch (error) {
    // Never print response bodies, request headers, child arguments, or credential-bearing errors.
    console.error(
      error instanceof assert.AssertionError
        ? error.message
        : 'Deployment command failed; inspect the last stage and workflow logs.',
    )
    process.exitCode = 1
  }
}
