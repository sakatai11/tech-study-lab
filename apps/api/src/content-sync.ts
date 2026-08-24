import matter from 'gray-matter'

import { type DomainKey, type ParsedContentSourceFile, createContentBundle } from '@tsl/shared'

export type ContentSourceFile = {
  relativePath: string
  source: string
}

export type ContentSyncQuestion = {
  questionId: string
  answerIndex: number
  domain: DomainKey
  topic: string
  lessonId: string
}

export type ContentSyncPayload = {
  userId: string
  questions: ContentSyncQuestion[]
}

export type ContentSyncExecutionMode = 'local' | 'remote'

export const CONTENT_SYNC_D1_DATABASE_NAME = 'tech-study-lab'
export const CONTENT_SYNC_REMOTE_CONFIRMATION_PHRASE = 'SYNC REMOTE CONTENT tech-study-lab'

function parseMarkdownFile({ relativePath, source }: ContentSourceFile): ParsedContentSourceFile {
  try {
    const parsed = matter(source)
    return { relativePath, frontmatter: parsed.data, body: parsed.content }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'failed to parse frontmatter'
    throw new Error(`${relativePath}: ${detail}`)
  }
}

/**
 * ファイル内容から同期対象だけを抽出する。ファイルI/Oを持たないためテスト可能。
 */
export function createContentSyncPayload(
  files: readonly ContentSourceFile[],
  userId: string,
): ContentSyncPayload {
  const bundle = createContentBundle(files.map(parseMarkdownFile))
  const questions: ContentSyncQuestion[] = bundle.lessons.flatMap((lesson) =>
    lesson.questions.map((question) => ({
      questionId: question.id,
      answerIndex: question.answerIndex,
      domain: lesson.domain,
      topic: lesson.topic,
      lessonId: lesson.lessonId,
    })),
  )

  return { userId, questions }
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/**
 * content から抽出・検証済みの最小ペイロードだけを、冪等なD1同期SQLへ変換する。
 */
export function createContentSyncSql(payload: ContentSyncPayload, createdAt: number): string {
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw new Error('createdAt must be a nonnegative safe integer')
  }

  const questionIds = payload.questions.map((question) => sqlString(question.questionId))
  const activeMembershipUpdate = questionIds.length
    ? `UPDATE questions SET is_active = CASE WHEN question_id IN (${questionIds.join(', ')}) THEN 1 ELSE 0 END`
    : 'UPDATE questions SET is_active = 0'
  const statements = [
    `INSERT INTO users (id, created_at) VALUES (${sqlString(payload.userId)}, ${createdAt}) ON CONFLICT(id) DO NOTHING`,
    ...payload.questions.map(
      (question) =>
        `INSERT INTO questions (question_id, answer_index, domain, topic, lesson_id, is_active) VALUES (${sqlString(question.questionId)}, ${question.answerIndex}, ${sqlString(question.domain)}, ${sqlString(question.topic)}, ${sqlString(question.lessonId)}, 1) ON CONFLICT(question_id) DO UPDATE SET answer_index = excluded.answer_index, domain = excluded.domain, topic = excluded.topic, lesson_id = excluded.lesson_id, is_active = excluded.is_active`,
    ),
    activeMembershipUpdate,
  ]

  return `${statements.join(';\n')};`
}

export function parseContentSyncExecutionMode(args: readonly string[]): ContentSyncExecutionMode {
  if (args.length === 1 && args[0] === '--local') {
    return 'local'
  }
  if (args.length === 1 && args[0] === '--remote') {
    return 'remote'
  }

  throw new Error('content sync requires exactly one of --local or --remote')
}

export function createContentSyncSqlSummary(payload: ContentSyncPayload): {
  questionCount: number
  statementCount: number
} {
  return {
    questionCount: payload.questions.length,
    statementCount: payload.questions.length + 2,
  }
}

export function isContentSyncRemoteConfirmation(confirmation: string): boolean {
  return confirmation === CONTENT_SYNC_REMOTE_CONFIRMATION_PHRASE
}

/**
 * Wrangler の対象D1とlocal/remoteモードを固定し、正確に検証済みのモード以外を渡さない。
 */
export function createLocalD1ExecuteArgs(filePath: string): readonly string[] {
  return ['d1', 'execute', CONTENT_SYNC_D1_DATABASE_NAME, '--local', '--file', filePath]
}

export function createRemoteD1ExecuteArgs(filePath: string): readonly string[] {
  return ['d1', 'execute', CONTENT_SYNC_D1_DATABASE_NAME, '--remote', '--file', filePath]
}
