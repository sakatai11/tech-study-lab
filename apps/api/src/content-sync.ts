import matter from 'gray-matter'

import { type ParsedContentSourceFile, createContentBundle } from '@tsl/shared'

export type ContentSourceFile = {
  relativePath: string
  source: string
}

export type ContentSyncQuestion = {
  questionId: string
  answerIndex: number
}

export type ContentSyncPayload = {
  userId: string
  questions: ContentSyncQuestion[]
}

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
  const questions: ContentSyncQuestion[] = bundle.questions.map((question) => ({
    questionId: question.id,
    answerIndex: question.answerIndex,
  }))

  return { userId, questions }
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/**
 * content から抽出・検証済みの最小ペイロードだけを、冪等なローカルD1同期SQLへ変換する。
 */
export function createContentSyncSql(payload: ContentSyncPayload, createdAt: number): string {
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw new Error('createdAt must be a nonnegative safe integer')
  }

  const statements = [
    `INSERT INTO users (id, created_at) VALUES (${sqlString(payload.userId)}, ${createdAt}) ON CONFLICT(id) DO NOTHING`,
    ...payload.questions.map(
      (question) =>
        `INSERT INTO questions (question_id, answer_index) VALUES (${sqlString(question.questionId)}, ${question.answerIndex}) ON CONFLICT(question_id) DO UPDATE SET answer_index = excluded.answer_index`,
    ),
  ]

  return `${statements.join(';\n')};`
}

/**
 * remote実行を混入させないため、wranglerへの引数をこの固定形に限定する。
 */
export function createLocalD1ExecuteArgs(filePath: string): readonly string[] {
  return ['d1', 'execute', 'tech-study-lab', '--local', '--file', filePath]
}
