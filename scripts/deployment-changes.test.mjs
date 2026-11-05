import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import {
  affectedWorkers,
  ciChanges,
  gitTree,
  releasePlan,
  validatePlan,
  workerSources,
} from './deployment-changes.mjs'

test('Worker scope excludes harness/docs/tests and includes shared runtime inputs [ADR-0017]', () => {
  for (const path of [
    'docs/design.md',
    'README.md',
    'AGENTS.md',
    '.ai/skills/x/SKILL.md',
    '.agents/skills/x',
    '.claude/settings.json',
    '.codex/hooks.json',
    'skills-lock.json',
    'architecture/graph.json',
    'scripts/test-hooks.sh',
    'scripts/architecture.mjs',
    'scripts/deployment.test.mjs',
    'apps/api/src/index.test.ts',
    'apps/web/vitest.config.ts',
    '.github/workflows/ci.yml',
  ])
    assert.deepEqual(affectedWorkers(path), [], path)
  assert.deepEqual(affectedWorkers('apps/web/src/app/page.tsx'), ['web'])
  assert.deepEqual(affectedWorkers('apps/api/src/routes/answers.ts'), ['api'])
  for (const path of [
    'content/security/x.md',
    'packages/shared/src/schema/api.ts',
    'pnpm-lock.yaml',
    'package.json',
    'tsconfig.base.json',
    '.npmrc',
    'apps/api/src/client.ts',
    '.github/workflows/deploy.yml',
    '.github/workflows/new-build.yml',
    'apps/api/package.json',
    'scripts/deployment-changes.mjs',
    'scripts/performance.mjs',
    'scripts/new-build-tool.mjs',
    'new-config.json',
  ])
    assert.deepEqual(affectedWorkers(path), ['api', 'web'], path)
})

test('release scope compares the last success, handles deletions/renames, and falls back to both [ADR-0017]', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'tsl-scope-'))
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const put = (path, value) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), value)
  }
  const commit = () => {
    git('add', '.')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture')
    return git('rev-parse', 'HEAD')
  }
  try {
    git('init', '-q')
    put('apps/api/src/index.ts', 'api-v1')
    put('apps/web/src/page.tsx', 'web-v1')
    const base = commit()
    const previous = {
      sha: base,
      tree: gitTree(base, cwd),
      apiVersion: 'api-1',
      webVersion: 'web-1',
    }
    const plan = (sha = git('rev-parse', 'HEAD')) => releasePlan(sha, previous, { cwd })
    put('docs/test.md', 'docs')
    commit()
    assert.deepEqual(plan().workers, { api: false, web: false })
    assert.deepEqual(ciChanges(base, { cwd }), { api: false, web: false, viewer: false })
    put('apps/api/src/index.ts', 'api-v2')
    const failedRelease = commit()
    assert.deepEqual(plan().workers, { api: true, web: false })
    put('.ai/skills/new/SKILL.md', 'harness')
    const head = commit()
    assert.deepEqual(
      plan().workers,
      { api: true, web: false },
      'a later docs/harness push must retain changes from a failed release',
    )
    const apiSuccess = { ...previous, sha: failedRelease, tree: gitTree(failedRelease, cwd) }
    assert.deepEqual(releasePlan(head, apiSuccess, { cwd }).workers, { api: false, web: false })
    assert.deepEqual(releasePlan(head, null, { cwd }).workers, { api: true, web: true })
    assert.deepEqual(releasePlan(head, previous, { cwd, force: true }).workers, {
      api: true,
      web: true,
    })
    assert.deepEqual(releasePlan(head, { ...previous, sha: 'f'.repeat(40) }, { cwd }).workers, {
      api: true,
      web: true,
    })
    renameSync(join(cwd, 'apps/web/src/page.tsx'), join(cwd, 'apps/web/src/home.tsx'))
    const renamed = commit()
    assert.deepEqual(releasePlan(renamed, apiSuccess, { cwd }).workers, { api: false, web: true })
    rmSync(join(cwd, 'apps/web/src/home.tsx'))
    const deleted = commit()
    assert.deepEqual(releasePlan(deleted, apiSuccess, { cwd }).workers, { api: false, web: true })
    const partial = releasePlan(deleted, apiSuccess, { cwd })
    validatePlan(partial, deleted, workerSources(deleted, cwd))
    assert.throws(() => validatePlan({ ...partial, baseline: null }, deleted, partial.sources))
    assert.throws(() => validatePlan(partial, base, partial.sources))
    assert.throws(() => validatePlan(partial, deleted, workerSources(base, cwd)))
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
