import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createContentSyncPayload,
  createContentSyncSql,
  createContentSyncSqlSummary,
} from '../src/content-sync'
import { FIXED_USER_ID } from '../src/fixed-user'
import { collectContentFiles } from './content-files'

// Generates files only. Remote execution belongs to the protected release workflow.
const [directory, timestamp, ...extra] = process.argv.slice(2)
assert(
  directory && timestamp && extra.length === 0,
  'usage: prepare-content <directory> <timestamp-ms>',
)
const createdAt = Number(timestamp)
const payload = createContentSyncPayload(
  collectContentFiles(fileURLToPath(new URL('../../../content/', import.meta.url))),
  FIXED_USER_ID,
)
const smokeQuestion = payload.questions[0]
assert(smokeQuestion, 'refusing to prepare an empty question set')
const sql = createContentSyncSql(payload, createdAt)
const output = resolve(directory)
mkdirSync(output, { recursive: true })
writeFileSync(resolve(output, 'sync.sql'), sql)
writeFileSync(
  resolve(output, 'summary.json'),
  JSON.stringify({
    ...createContentSyncSqlSummary(payload),
    smokeQuestion: smokeQuestion.questionId,
    smokeLesson: smokeQuestion.lessonId,
  }),
)
