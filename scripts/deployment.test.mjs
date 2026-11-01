import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  assertDeploymentProtection,
  assertFreshSource,
  assertTargetConfig,
  assertWorkflowContext,
  createManifest,
  getTarget,
  lastRelease,
  releaseStages,
  runRelease,
  validateManifest,
} from './deployment-lib.mjs'
import { conditionsId } from './performance-lib.mjs'

const tree = 'b'.repeat(40)
const version = '11111111-1111-1111-1111-111111111111'
const verified = {
  tree,
  runId: '10',
  runAttempt: '1',
  apiVersion: version,
  webVersion: version,
  performance: {
    passed: true,
    conditionsId: conditionsId(),
    tree,
    runId: '10',
    runAttempt: '1',
    apiVersion: version,
    webVersion: version,
    cpu: { status: 'passed' },
  },
}

test('branch and environment cannot be selected independently', () => {
  assertWorkflowContext('verification', {
    GITHUB_REF: 'refs/heads/develop',
    GITHUB_EVENT_NAME: 'push',
  })
  assert.throws(() =>
    assertWorkflowContext('production', {
      GITHUB_REF: 'refs/heads/develop',
      GITHUB_EVENT_NAME: 'push',
    }),
  )
  assert.throws(() =>
    assertWorkflowContext('verification', {
      GITHUB_REF: 'refs/heads/develop',
      GITHUB_EVENT_NAME: 'pull_request',
    }),
  )
  assert.throws(() => getTarget('--config'))
})

test('release baseline survives failed runs and is invalidated by rollback', async () => {
  const failed = {
    id: 3,
    sha: 'c'.repeat(40),
    payload: { kind: 'tsl-release', contentTree: 'd'.repeat(40) },
  }
  const success = {
    id: 2,
    sha: 'a'.repeat(40),
    payload: { kind: 'tsl-release', contentTree: 'b'.repeat(40) },
  }
  const auto = { id: 4, sha: 'c'.repeat(40), payload: {} }
  let records = [auto, failed, success]
  const api = async (path) =>
    path.startsWith('deployments?')
      ? records
      : path.includes('/3/')
        ? [{ state: 'failure' }]
        : [{ state: 'success' }]
  assert.equal((await lastRelease('verification', api)).contentTree, 'b'.repeat(40))
  records = [{ id: 5, sha: 'c'.repeat(40), payload: { kind: 'tsl-rollback' } }, ...records]
  assert.equal(await lastRelease('verification', api), null)
})

test('production proceeds without reviewer approval but requires an exact branch policy', () => {
  const protection = {
    protection_rules: [],
    deployment_branch_policy: { custom_branch_policies: true },
  }
  assertDeploymentProtection('production', protection, [{ name: 'main', type: 'branch' }])
  assert.throws(() =>
    assertDeploymentProtection('production', { ...protection, deployment_branch_policy: null }, [
      { name: 'main', type: 'branch' },
    ]),
  )
  assert.throws(() =>
    assertDeploymentProtection('production', protection, [{ name: '*', type: 'branch' }]),
  )
  assert.throws(() =>
    assertDeploymentProtection('production', protection, [{ name: 'main', type: 'tag' }]),
  )
  assert.throws(() =>
    assertDeploymentProtection('production', protection, [
      { name: 'main', type: 'branch' },
      { name: 'develop', type: 'branch' },
    ]),
  )
})

test('stale run and unverified production source fail before mutations', () => {
  assertFreshSource('verification', 'a'.repeat(40), 'a'.repeat(40), 'b'.repeat(40), null)
  assert.throws(() =>
    assertFreshSource('verification', 'a'.repeat(40), 'c'.repeat(40), 'b'.repeat(40), null),
  )
  assert.throws(() =>
    assertFreshSource('production', 'a'.repeat(40), 'a'.repeat(40), 'b'.repeat(40), null),
  )
  assertFreshSource('production', 'a'.repeat(40), 'a'.repeat(40), tree, verified)
})

test('production refuses verification records without a matching performance proof [ADR-0016]', () => {
  const production = (record) =>
    assertFreshSource('production', 'a'.repeat(40), 'a'.repeat(40), tree, record)
  const withProof = (change) => ({
    ...verified,
    performance: { ...verified.performance, ...change },
  })
  // 導入前の成功記録（smoke までの成功）は性能試験済みとみなさない。
  assert.throws(() => production({ ...verified, performance: undefined }), /no performance/)
  assert.throws(() => production(withProof({ passed: false })), /did not pass/)
  assert.throws(() => production(withProof({ cpu: { status: 'inconclusive' } })), /CPU log/)
  assert.throws(() => production(withProof({ conditionsId: 'old-conditions' })), /conditions/)
  assert.throws(() => production(withProof({ tree: 'c'.repeat(40) })), /source tree/)
  assert.throws(() => production(withProof({ webVersion: 'other' })), /Web version/)
  assert.throws(() => production(withProof({ runAttempt: '2' })), /attempt/)
  assert.throws(() => production({ ...verified, tree: 'c'.repeat(40) }), /latest successful/)
})

test('API and Web cannot bind a resource from the other environment', () => {
  const target = getTarget('verification')
  const api = {
    name: target.api,
    account_id: target.account,
    d1_databases: [
      { binding: 'DB', database_name: target.database, database_id: target.databaseId },
    ],
  }
  const web = {
    name: target.web,
    services: [{ binding: 'API', service: target.api, entrypoint: 'InternalApi' }],
    migrations: [],
    workers_dev: true,
    preview_urls: false,
    observability: { enabled: true, head_sampling_rate: 1 },
  }
  api.observability = { enabled: true, head_sampling_rate: 1 }
  assertTargetConfig(target, api, web)
  assert.throws(
    () =>
      assertTargetConfig(target, api, {
        ...web,
        observability: { enabled: true, head_sampling_rate: 0.1 },
      }),
    /every invocation/,
  )
  assert.throws(
    () => assertTargetConfig(target, { ...api, observability: undefined }, web),
    /every invocation/,
  )
  assert.throws(() =>
    assertTargetConfig(target, { ...api, name: getTarget('production').api }, web),
  )
  assert.throws(() =>
    assertTargetConfig(
      target,
      {
        ...api,
        d1_databases: [{ ...api.d1_databases[0], database_id: getTarget('production').databaseId }],
      },
      web,
    ),
  )
  assert.throws(() =>
    assertTargetConfig(target, api, {
      ...web,
      services: [{ binding: 'API', service: getTarget('production').api }],
    }),
  )
  assert.throws(() => assertTargetConfig(target, api, { ...web, migrations: [{ tag: 'v1' }] }))
})

test('manifest detects tampered SQL, added files, and wrong environment', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tsl-release-test-'))
  try {
    mkdirSync(join(directory, 'content'))
    writeFileSync(join(directory, 'content/sync.sql'), 'SELECT 1;')
    const manifest = createManifest(directory, {
      environment: 'verification',
      sha: 'a'.repeat(40),
      tree: 'b'.repeat(40),
      contentTree: 'c'.repeat(40),
      questionCount: 1,
    })
    validateManifest(directory, manifest, 'verification', 'a'.repeat(40))
    assert.throws(() => validateManifest(directory, manifest, 'production', 'a'.repeat(40)))
    writeFileSync(join(directory, 'content/sync.sql'), 'DELETE FROM users;')
    assert.throws(() => validateManifest(directory, manifest, 'verification', 'a'.repeat(40)))
    writeFileSync(join(directory, 'content/sync.sql'), 'SELECT 1;')
    writeFileSync(join(directory, 'extra.sql'), 'SELECT 2;')
    assert.throws(() => validateManifest(directory, manifest, 'verification', 'a'.repeat(40)))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('release applies schema/data/API/Web in order and stops at every failed stage [ADR-0010] [ADR-0016]', async () => {
  const common = ['preflight', 'migrations', 'sync', 'api', 'apiHealth', 'web', 'smoke']
  assert.deepEqual(releaseStages('production'), [...common, 'record'])
  assert.deepEqual(releaseStages('verification'), [...common, 'performance', 'cpuLogs', 'record'])
  for (const environment of ['verification', 'production']) {
    const stages = releaseStages(environment)
    for (const failed of [undefined, ...stages]) {
      const calls = []
      const steps = Object.fromEntries(
        stages.map((stage) => [
          stage,
          async () => {
            calls.push(stage)
            if (stage === failed) throw new Error(`failed: ${stage}`)
          },
        ]),
      )
      if (failed) {
        await assert.rejects(runRelease(environment, steps), new RegExp(`failed: ${failed}`))
        assert.deepEqual(calls, stages.slice(0, stages.indexOf(failed) + 1))
      } else {
        await runRelease(environment, steps)
        assert.deepEqual(calls, stages)
      }
    }
  }
  // 検証環境で性能段階が欠けた実装は成功記録へ進まない。
  const missing = Object.fromEntries(
    releaseStages('production').map((stage) => [stage, async () => {}]),
  )
  await assert.rejects(runRelease('verification', missing), /performance is missing/)
})
