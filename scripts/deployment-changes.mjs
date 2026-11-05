import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Classify build inputs; unknown paths affect both Workers, while test sources do not. */
export function affectedWorkers(path) {
  if (path.startsWith('content/')) return ['api', 'web']
  if (
    /(^|\/)(?:AGENTS|CLAUDE|README)\.md$/.test(path) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) ||
    /(^|\/)(?:__tests__|__fixtures__)\//.test(path) ||
    /(^|\/)vitest\.config\.[^/]+$/.test(path) ||
    /^(?:docs|architecture|\.ai|\.agents|\.claude|\.codex)\//.test(path) ||
    path.startsWith('.github/ISSUE_TEMPLATE/') ||
    [
      '.github/pull_request_template.md',
      '.github/workflows/ci.yml',
      '.github/workflows/rollback.yml',
    ].includes(path) ||
    [
      'skills-lock.json',
      'biome.json',
      '.dependency-cruiser.cjs',
      '.dependency-cruiser.resolve.cjs',
    ].includes(path) ||
    /^scripts\/(?:fixtures|verification)\//.test(path) ||
    /^scripts\/(?:architecture|test-adr-refs|test-design-chapter-refs|sync-agent-config|design-references|check-design-references|review-design-references|markdown-headings|check-migration-immutability)\.mjs$/.test(
      path,
    ) ||
    path === 'scripts/test-hooks.sh'
  )
    return []
  // Web imports this factory at runtime; the API AppType import is type-only.
  if (['apps/api/src/client.ts', 'apps/api/package.json'].includes(path)) return ['api', 'web']
  if (path.startsWith('apps/web/')) return ['web']
  if (path.startsWith('apps/api/')) return ['api']
  return ['api', 'web']
}

/** Resolve a validated commit to its Git tree without reading working-tree files. */
export function gitTree(ref, cwd) {
  assert.match(ref, /^(?:HEAD|[a-f0-9]{40})$/)
  return execFileSync('git', ['rev-parse', `${ref}^{tree}`], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

/** Hash path/mode/blob metadata per Worker, including deletions and renames. */
export function workerSources(ref, cwd) {
  assert.match(ref, /^(?:HEAD|[a-f0-9]{40})$/)
  const listing = execFileSync('git', ['ls-tree', '-rz', '--full-tree', ref], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const hashes = { api: createHash('sha256'), web: createHash('sha256') }
  for (const entry of listing.split('\0').filter(Boolean)) {
    const path = entry.slice(entry.indexOf('\t') + 1)
    for (const worker of affectedWorkers(path)) hashes[worker].update(`${entry}\0`)
  }
  return Object.fromEntries(
    Object.entries(hashes).map(([worker, hash]) => [worker, hash.digest('hex')]),
  )
}

/** Compare a trusted success with the candidate; missing/unreadable baselines force both builds. */
export function releasePlan(sha, previous, { force = false, cwd } = {}) {
  assert.match(sha, /^[a-f0-9]{40}$/)
  const sources = workerSources(sha, cwd)
  const plan = {
    version: 1,
    sha,
    sources,
    workers: { api: true, web: true },
    baseline: null,
    reason: 'full',
  }
  if (force || !previous) return plan
  try {
    assert(previous.apiVersion && previous.webVersion)
    assert.equal(gitTree(previous.sha, cwd), previous.tree)
    const before = workerSources(previous.sha, cwd)
    plan.workers = Object.fromEntries(
      ['api', 'web'].map((worker) => [worker, sources[worker] !== before[worker]]),
    )
    plan.baseline = {
      sha: previous.sha,
      apiVersion: previous.apiVersion,
      webVersion: previous.webVersion,
    }
    plan.reason = 'last-success'
  } catch {
    plan.reason = 'unavailable-baseline'
  }
  return plan
}

/** Reject plans for another commit/source or partial releases without a baseline. */
export function validatePlan(plan, sha, sources) {
  assert.equal(plan.version, 1)
  assert.equal(plan.sha, sha, 'plan commit mismatch')
  assert.deepEqual(plan.sources, sources, 'plan source mismatch')
  assert.equal(typeof plan.workers.api, 'boolean')
  assert.equal(typeof plan.workers.web, 'boolean')
  assert(plan.workers.api || plan.workers.web, 'empty release plan')
  if (!plan.workers.api || !plan.workers.web)
    assert(plan.baseline, 'partial release requires a baseline')
}

/** Select PR Worker/viewer builds from the base commit, forcing all for manual runs. */
export function ciChanges(base, { force = false, cwd } = {}) {
  if (force || !base) return { api: true, web: true, viewer: true }
  assert.match(base, /^[a-f0-9]{40}$/)
  const before = workerSources(base, cwd)
  const after = workerSources('HEAD', cwd)
  const api = before.api !== after.api
  const web = before.web !== after.web
  const paths = execFileSync('git', ['diff', '--name-only', '-z', '--no-renames', base, 'HEAD'], {
    cwd,
    encoding: 'utf8',
  }).split('\0')
  const viewer =
    api ||
    web ||
    paths.some(
      (path) =>
        (path.startsWith('architecture/') ||
          path === 'scripts/architecture.mjs' ||
          path === 'architecture/traversal.mjs') &&
        !path.endsWith('.md'),
    )
  return { api, web, viewer }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputs = ciChanges(process.env.PR_BASE_SHA, { force: process.env.FORCE_FULL === 'true' })
  for (const [name, value] of Object.entries(outputs)) {
    console.info(`${name}=${value}`)
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
  }
}
