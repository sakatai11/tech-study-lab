import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  type ContentSourceFile,
  createContentSyncPayload,
  createContentSyncSql,
  createLocalD1ExecuteArgs,
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

const contentRoot = fileURLToPath(new URL('../../../content/', import.meta.url))
const payload = createContentSyncPayload(collectContentFiles(contentRoot), FIXED_USER_ID)
const sql = createContentSyncSql(payload, Date.now())
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'tech-study-lab-content-sync-'))
const sqlPath = join(temporaryDirectory, 'content-sync.sql')

try {
  writeFileSync(sqlPath, sql, 'utf8')
  const result = spawnSync('wrangler', createLocalD1ExecuteArgs(sqlPath), {
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
