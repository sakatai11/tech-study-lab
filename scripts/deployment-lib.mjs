import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const account = '4459a4d59a634a07eac0400d39b84f20'
const targets = {
  verification: {
    branch: 'develop',
    web: 'tech-study-lab-web-test',
    api: 'tech-study-lab-api-test',
    database: 'tech-study-lab-test',
    databaseId: '1a97bb77-f40d-40e1-b59d-162fb80c7324',
    apiConfig: 'apps/api/wrangler.test.jsonc',
    webTarget: 'edge',
  },
  production: {
    branch: 'main',
    web: 'tech-study-lab-web',
    api: 'tech-study-lab-api',
    database: 'tech-study-lab',
    databaseId: '42020ece-d4f6-4782-af8c-dcf01086688f',
    apiConfig: 'apps/api/wrangler.toml',
    webTarget: 'production',
  },
}

export function getTarget(environment) {
  assert(Object.hasOwn(targets, environment), 'unknown deployment environment')
  return { environment, account, ...targets[environment] }
}

export function assertWorkflowContext(environment, env) {
  const target = getTarget(environment)
  assert.equal(env.GITHUB_REF, `refs/heads/${target.branch}`, 'deployment branch mismatch')
  assert(['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME), 'unsupported deploy event')
}

export function assertApprovalProtection(environment, config, policies) {
  const target = getTarget(environment)
  assert.equal(
    config.deployment_branch_policy?.custom_branch_policies,
    true,
    'explicit branch policy required',
  )
  assert.deepEqual(
    policies.map(({ name, type }) => ({ name, type })),
    [{ name: target.branch, type: 'branch' }],
    'only the exact deployment branch is allowed',
  )
  if (environment === 'production') {
    assert(
      config.protection_rules.some(
        (rule) => rule.type === 'required_reviewers' && rule.reviewers?.length > 0,
      ),
      'production requires reviewer protection',
    )
  }
}

export function assertFreshSource(environment, sha, latestSha, tree, verification) {
  assert.match(sha, /^[a-f0-9]{40}$/)
  assert.equal(
    sha,
    latestSha,
    'branch advanced; start a new run instead of deploying stale approval',
  )
  if (environment === 'production') {
    assert.equal(
      verification?.tree,
      tree,
      'production source must match the latest successful verification',
    )
  }
}

export function deploymentUrls(target, subdomain) {
  assert.match(
    subdomain ?? '',
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    'DEPLOY_ACCOUNT_SUBDOMAIN is required',
  )
  return {
    webUrl: `https://${target.web}.${subdomain}.workers.dev`,
    apiUrl: `https://${target.api}.${subdomain}.workers.dev`,
  }
}

export function assertTargetConfig(target, api, web) {
  assert.equal(api.name, target.api, 'API Worker mismatch')
  if (api.account_id) assert.equal(api.account_id, target.account, 'API account mismatch')
  assert.equal(api.d1_databases?.length, 1, 'exactly one D1 binding required')
  const db = api.d1_databases[0]
  assert.equal(db.binding, 'DB')
  assert.equal(db.database_name, target.database, 'D1 name mismatch')
  assert.equal(db.database_id, target.databaseId, 'D1 ID mismatch')
  assert.equal(web.name, target.web, 'Web Worker mismatch')
  assert.deepEqual(
    web.services,
    [{ binding: 'API', service: target.api, entrypoint: 'InternalApi' }],
    'API Service Binding mismatch',
  )
  assert.deepEqual(
    web.migrations ?? [],
    target.environment === 'production'
      ? [
          { tag: 'v1', new_sqlite_classes: ['DOQueueHandler'] },
          { tag: 'v2', deleted_classes: ['DOQueueHandler'] },
        ]
      : [],
    'Web migration history mismatch',
  )
  if (target.environment === 'verification') {
    assert.equal(web.workers_dev, true)
    assert.equal(web.preview_urls, false)
  }
}

export function inventory(directory, prefix = '') {
  return Object.fromEntries(
    readdirSync(join(directory, prefix))
      .sort()
      .flatMap((name) => {
        const path = prefix ? `${prefix}/${name}` : name
        if (path === 'manifest.json') return []
        assert(!/^\.env(?:\.|$)/.test(name) && name !== '.dev.vars', 'credential file in release')
        const stat = lstatSync(join(directory, path))
        assert(!stat.isSymbolicLink(), 'symlinks are forbidden in release artifacts')
        if (stat.isDirectory()) return Object.entries(inventory(directory, path))
        assert(stat.isFile(), 'non-file release artifact')
        return [
          [
            path,
            createHash('sha256')
              .update(readFileSync(join(directory, path)))
              .digest('hex'),
          ],
        ]
      }),
  )
}

export function createManifest(directory, metadata) {
  return { version: 1, ...metadata, files: inventory(directory) }
}

export function validateManifest(directory, manifest, environment, sha) {
  assert.equal(manifest.version, 1)
  assert.equal(manifest.environment, environment, 'artifact environment mismatch')
  assert.equal(manifest.sha, sha, 'artifact commit mismatch')
  assert.match(manifest.tree, /^[a-f0-9]{40}$/)
  assert.match(manifest.contentTree, /^[a-f0-9]{40}$/)
  assert(
    Number.isSafeInteger(manifest.questionCount) && manifest.questionCount > 0,
    'empty question set is not a deployable release',
  )
  assert.deepEqual(inventory(directory), manifest.files, 'release artifact hash mismatch')
}

export async function runRelease(steps) {
  for (const name of [
    'preflight',
    'migrations',
    'sync',
    'api',
    'apiHealth',
    'web',
    'smoke',
    'record',
  ]) {
    await steps[name]()
  }
}

export async function github(path, { method = 'GET', body, env = process.env } = {}) {
  assert(env.GITHUB_TOKEN, 'GitHub token is required')
  assert.match(env.GITHUB_REPOSITORY ?? '', /^[\w.-]+\/[\w.-]+$/)
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  assert(response.ok, `GitHub ${method} ${path.split('?')[0]} failed (${response.status})`)
  return response.status === 204 ? null : response.json()
}

export async function lastRelease(environment, api = github) {
  for (let page = 1; ; page++) {
    const deployments = await api(
      `deployments?environment=${environment}&per_page=100&page=${page}`,
    )
    for (const deployment of deployments) {
      if (!['tsl-release', 'tsl-rollback'].includes(deployment.payload?.kind)) continue
      const statuses = await api(`deployments/${deployment.id}/statuses?per_page=100`)
      if (!statuses.some(({ state }) => state === 'success')) continue
      return deployment.payload.kind === 'tsl-rollback'
        ? null
        : { sha: deployment.sha, ...deployment.payload }
    }
    if (deployments.length < 100) return null
  }
}

export async function recordRelease(environment, sha, payload, api = github) {
  const deployment = await api('deployments', {
    method: 'POST',
    body: {
      ref: sha,
      environment,
      auto_merge: false,
      required_contexts: [],
      transient_environment: false,
      production_environment: environment === 'production',
      payload,
    },
  })
  assert(deployment.id, 'deployment record was not created')
  await api(`deployments/${deployment.id}/statuses`, {
    method: 'POST',
    body: {
      state: 'success',
      auto_inactive: false,
      log_url: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    },
  })
}
