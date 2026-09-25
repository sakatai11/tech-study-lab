import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const migrationDirectory = 'apps/api/drizzle/migrations'

function isImmutableMigrationPath(filePath) {
  if (!filePath.startsWith(`${migrationDirectory}/`)) return false

  const relativePath = filePath.slice(migrationDirectory.length + 1)
  return (
    relativePath.endsWith('.sql') ||
    (relativePath.startsWith('meta/') && relativePath.endsWith('_snapshot.json'))
  )
}

export function findImmutableFileChanges(baseBlobs, headBlobs) {
  const changes = []

  for (const [filePath, baseBlob] of baseBlobs) {
    if (!isImmutableMigrationPath(filePath)) continue

    const headBlob = headBlobs.get(filePath)
    if (headBlob === undefined) changes.push({ path: filePath, reason: 'missing' })
    else if (headBlob !== baseBlob) changes.push({ path: filePath, reason: 'modified' })
  }

  return changes.sort((left, right) => left.path.localeCompare(right.path))
}

function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const detail = error.stderr?.toString().trim()
    throw new Error(`git ${args[0]} failed${detail ? `: ${detail}` : ''}`)
  }
}

function resolveCommit(revision, cwd) {
  return git(
    ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`],
    cwd,
  ).trim()
}

function readImmutableBlobs(revision, cwd) {
  const commit = resolveCommit(revision, cwd)
  const output = git(['ls-tree', '-r', '-z', '--full-tree', commit, '--', migrationDirectory], cwd)
  const blobs = new Map()

  for (const record of output.split('\0')) {
    if (!record) continue

    const separator = record.indexOf('\t')
    if (separator === -1) throw new Error(`Unexpected git ls-tree record for ${revision}`)

    const [, objectType, objectId] = record.slice(0, separator).split(' ')
    const filePath = record.slice(separator + 1)
    if (objectType === 'blob' && isImmutableMigrationPath(filePath)) blobs.set(filePath, objectId)
  }

  return blobs
}

export function checkMigrationImmutability(baseRevision, headRevision, cwd = process.cwd()) {
  if (!baseRevision || !headRevision)
    throw new Error('Usage: node scripts/check-migration-immutability.mjs <base-sha> <head-ref>')

  const baseBlobs = readImmutableBlobs(baseRevision, cwd)
  if (baseBlobs.size === 0)
    throw new Error(`No Drizzle migration SQL or snapshots found in base ${baseRevision}`)

  const headBlobs = readImmutableBlobs(headRevision, cwd)
  return findImmutableFileChanges(baseBlobs, headBlobs)
}

function main(args) {
  try {
    const [baseRevision, headRevision, ...extraArgs] = args
    if (extraArgs.length > 0) {
      throw new Error('Usage: node scripts/check-migration-immutability.mjs <base-sha> <head-ref>')
    }

    const changes = checkMigrationImmutability(baseRevision, headRevision)
    if (changes.length > 0) {
      for (const change of changes) {
        const detail = change.reason === 'missing' ? 'deleted or renamed' : 'content changed'
        console.error(`::error::Merged migration artifact ${detail}: ${change.path}`)
      }
      console.error(
        'Add a new migration to correct an applied migration; do not rewrite existing SQL or snapshots.',
      )
      process.exitCode = 1
      return
    }

    console.log(`Migration immutability check passed (${baseRevision} -> ${headRevision}).`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href)
  main(process.argv.slice(2))
