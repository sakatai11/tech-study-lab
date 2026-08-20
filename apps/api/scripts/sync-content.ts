import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

import {
  CONTENT_SYNC_D1_DATABASE_NAME,
  CONTENT_SYNC_REMOTE_CONFIRMATION_PHRASE,
  type ContentSourceFile,
  type ContentSyncPayload,
  createContentSyncPayload,
  createContentSyncSql,
  createContentSyncSqlSummary,
  createLocalD1ExecuteArgs,
  createRemoteD1ExecuteArgs,
  isContentSyncRemoteConfirmation,
  parseContentSyncExecutionMode,
} from '../src/content-sync'
import { FIXED_USER_ID } from '../src/fixed-user'

function collectContentFiles(contentRoot: string, directory = contentRoot): ContentSourceFile[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const entryPath = join(directory, entry.name)

      if (entry.isDirectory()) {
        return collectContentFiles(contentRoot, entryPath)
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        return []
      }

      return [
        {
          relativePath: relative(contentRoot, entryPath).split(sep).join('/'),
          source: readFileSync(entryPath, 'utf8'),
        },
      ]
    })
}

async function requireRemoteConfirmation(
  sqlPath: string,
  payload: ContentSyncPayload,
): Promise<void> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new Error('remote content sync requires an interactive TTY confirmation')
  }

  const { questionCount, statementCount } = createContentSyncSqlSummary(payload)
  console.info(`Remote content sync target: ${CONTENT_SYNC_D1_DATABASE_NAME}
Generated SQL file: ${sqlPath}
Questions: ${questionCount}; SQL statements: ${statementCount}
Required deployment order: remote migrations must be applied before content sync.`)

  const prompt = createInterface({ input: process.stdin, output: process.stdout })

  try {
    const confirmation = await prompt.question(
      `Type exactly "${CONTENT_SYNC_REMOTE_CONFIRMATION_PHRASE}" to execute remote content sync: `,
    )
    if (!isContentSyncRemoteConfirmation(confirmation)) {
      throw new Error('remote content sync confirmation did not match')
    }
  } finally {
    prompt.close()
  }
}

// Validate mode before content reads, temporary-file creation, or any other side effect.
const executionMode = parseContentSyncExecutionMode(process.argv.slice(2))
const contentRoot = fileURLToPath(new URL('../../../content/', import.meta.url))
const payload = createContentSyncPayload(collectContentFiles(contentRoot), FIXED_USER_ID)
const sql = createContentSyncSql(payload, Date.now())
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'tech-study-lab-content-sync-'))
const sqlPath = join(temporaryDirectory, 'content-sync.sql')

try {
  writeFileSync(sqlPath, sql, 'utf8')
  if (executionMode === 'remote') {
    await requireRemoteConfirmation(sqlPath, payload)
  }

  const wranglerArgs =
    executionMode === 'local'
      ? createLocalD1ExecuteArgs(sqlPath)
      : createRemoteD1ExecuteArgs(sqlPath)
  const result = spawnSync('wrangler', wranglerArgs, {
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`wrangler d1 execute failed with status ${result.status ?? 'unknown'}`)
  }
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true })
}
