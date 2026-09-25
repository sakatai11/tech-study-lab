import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  checkMigrationImmutability,
  findImmutableFileChanges,
} from './check-migration-immutability.mjs'

const sqlPath = 'apps/api/drizzle/migrations/0001_initial.sql'
const snapshotPath = 'apps/api/drizzle/migrations/meta/0001_snapshot.json'
const journalPath = 'apps/api/drizzle/migrations/meta/_journal.json'

test('allows new migrations, new snapshots, and journal appends', () => {
  const base = new Map([
    [sqlPath, 'sql-v1'],
    [snapshotPath, 'snapshot-v1'],
    [journalPath, 'journal-v1'],
  ])
  const head = new Map([
    [sqlPath, 'sql-v1'],
    [snapshotPath, 'snapshot-v1'],
    [journalPath, 'journal-with-new-entry'],
    ['apps/api/drizzle/migrations/0002_added.sql', 'new-sql'],
    ['apps/api/drizzle/migrations/meta/0002_snapshot.json', 'new-snapshot'],
  ])

  assert.deepEqual(findImmutableFileChanges(base, head), [])
})

test('rejects a deleted or renamed migration even if a replacement is added', () => {
  const base = new Map([[sqlPath, 'sql-v1']])
  const head = new Map([['apps/api/drizzle/migrations/0001_renamed.sql', 'sql-v1']])

  assert.deepEqual(findImmutableFileChanges(base, head), [{ path: sqlPath, reason: 'missing' }])
})

test('rejects changes to an existing migration SQL file', () => {
  const base = new Map([[sqlPath, 'sql-v1']])
  const head = new Map([[sqlPath, 'sql-v2']])

  assert.deepEqual(findImmutableFileChanges(base, head), [{ path: sqlPath, reason: 'modified' }])
})

test('rejects deletion and content changes of existing snapshots', () => {
  const base = new Map([
    [snapshotPath, 'snapshot-v1'],
    ['apps/api/drizzle/migrations/meta/0002_snapshot.json', 'snapshot-v2'],
  ])
  const head = new Map([[snapshotPath, 'snapshot-v1-edited']])

  assert.deepEqual(findImmutableFileChanges(base, head), [
    { path: snapshotPath, reason: 'modified' },
    { path: 'apps/api/drizzle/migrations/meta/0002_snapshot.json', reason: 'missing' },
  ])
})

test('ignores files outside the Drizzle migration and snapshot paths', () => {
  const base = new Map([
    ['apps/api/drizzle/schema.sql', 'schema-v1'],
    ['apps/api/drizzle/migrations/meta/_journal.json', 'journal-v1'],
    ['other/migrations/0001_initial.sql', 'other-v1'],
  ])
  const head = new Map([
    ['apps/api/drizzle/schema.sql', 'schema-v2'],
    ['apps/api/drizzle/migrations/meta/_journal.json', 'journal-v2'],
    ['other/migrations/0001_initial.sql', 'other-v2'],
  ])

  assert.deepEqual(findImmutableFileChanges(base, head), [])
})

test('compares the supplied base and checkout HEAD trees', () => {
  const repository = mkdtempSync(path.join(os.tmpdir(), 'migration-immutability-'))
  const write = (filePath, contents) => {
    const absolutePath = path.join(repository, filePath)
    mkdirSync(path.dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, contents)
  }
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: repository,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

  try {
    git('init', '--quiet', '--initial-branch=main')
    git('config', 'user.name', 'Migration immutability test')
    git('config', 'user.email', 'migration-immutability@example.invalid')
    write(sqlPath, 'CREATE TABLE initial (id INTEGER PRIMARY KEY);')
    write(snapshotPath, '{"id":"snapshot-1"}')
    write(journalPath, '{"entries":[]}')
    git('add', '.')
    git('commit', '--quiet', '-m', 'base')
    const base = git('rev-parse', 'HEAD').trim()

    write('apps/api/drizzle/migrations/0002_added.sql', 'CREATE TABLE added (id INTEGER);')
    write('apps/api/drizzle/migrations/meta/0002_snapshot.json', '{"id":"snapshot-2"}')
    write(journalPath, '{"entries":[{"idx":0,"tag":"0002_added"}]}')
    git('add', '.')
    git('commit', '--quiet', '-m', 'add migration')
    const checkoutHead = git('rev-parse', 'HEAD').trim()

    assert.deepEqual(checkMigrationImmutability(base, checkoutHead, repository), [])

    write(sqlPath, 'DROP TABLE initial;')
    write(snapshotPath, '{"id":"snapshot-changed"}')
    git('add', '.')
    git('commit', '--quiet', '-m', 'rewrite merged artifacts')
    const changedHead = git('rev-parse', 'HEAD').trim()

    assert.deepEqual(checkMigrationImmutability(base, changedHead, repository), [
      { path: sqlPath, reason: 'modified' },
      { path: snapshotPath, reason: 'modified' },
    ])
  } finally {
    rmSync(repository, { recursive: true, force: true })
  }
})
