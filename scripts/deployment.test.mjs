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
  runRelease,
  validateManifest,
} from './deployment-lib.mjs'

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
  assertFreshSource('production', 'a'.repeat(40), 'a'.repeat(40), 'b'.repeat(40), {
    tree: 'b'.repeat(40),
  })
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
  }
  assertTargetConfig(target, api, web)
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

test('release applies schema/data/API/Web in order and stops at every failed stage', async () => {
  const stages = ['preflight', 'migrations', 'sync', 'api', 'apiHealth', 'web', 'smoke', 'record']
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
      await assert.rejects(runRelease(steps), new RegExp(`failed: ${failed}`))
      assert.deepEqual(calls, stages.slice(0, stages.indexOf(failed) + 1))
    } else {
      await runRelease(steps)
      assert.deepEqual(calls, stages)
    }
  }
})
