import matter from 'gray-matter'

import {
  domainKeySchema,
  topicFrontmatterSchema,
  validatedLessonFrontmatterSchema,
  validatedMcqSchema,
} from '@tsl/shared'

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

type ContentPath = {
  domain: string
  topic: string
  filename: string
  relativePath: string
}

function invalidContent(relativePath: string, message: string): never {
  throw new Error(`${relativePath}: ${message}`)
}

function contentPathFor(relativePath: string): ContentPath {
  const segments = relativePath.split('/')
  const [domain, topic, filename] = segments

  if (
    segments.length !== 3 ||
    !domain ||
    !topic ||
    !filename ||
    relativePath.startsWith('/') ||
    segments.some((segment) => segment === '.' || segment === '..' || segment.length === 0)
  ) {
    return invalidContent(relativePath, 'must be a file directly below <domain>/<topic>')
  }

  if (!domainKeySchema.safeParse(domain).success) {
    return invalidContent(relativePath, `unknown domain directory "${domain}"`)
  }

  if (!filename.endsWith('.md')) {
    return invalidContent(relativePath, 'must be a Markdown file')
  }

  return { domain, topic, filename, relativePath }
}

function frontmatterFor(relativePath: string, source: string): unknown {
  try {
    return matter(source).data
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'failed to parse frontmatter'
    return invalidContent(relativePath, detail)
  }
}

function validateTopicFile(path: ContentPath, frontmatter: unknown): void {
  const result = topicFrontmatterSchema.safeParse(frontmatter)
  if (!result.success) {
    invalidContent(path.relativePath, result.error.issues.map((issue) => issue.message).join('; '))
  }

  if (result.data.topic !== path.topic) {
    invalidContent(
      path.relativePath,
      `topic frontmatter "${result.data.topic}" does not match directory "${path.topic}"`,
    )
  }
}

function validateLessonFile(path: ContentPath, frontmatter: unknown): ContentSyncQuestion[] {
  const lessonResult = validatedLessonFrontmatterSchema.safeParse(frontmatter)
  if (!lessonResult.success) {
    invalidContent(
      path.relativePath,
      lessonResult.error.issues.map((issue) => issue.message).join('; '),
    )
  }

  const lesson = lessonResult.data
  if (lesson.domain !== path.domain) {
    invalidContent(
      path.relativePath,
      `domain frontmatter "${lesson.domain}" does not match directory "${path.domain}"`,
    )
  }
  if (lesson.topic !== path.topic) {
    invalidContent(
      path.relativePath,
      `topic frontmatter "${lesson.topic}" does not match directory "${path.topic}"`,
    )
  }

  const filenameLessonId = path.filename.slice(0, -'.md'.length)
  if (lesson.lessonId !== filenameLessonId) {
    invalidContent(
      path.relativePath,
      `lessonId "${lesson.lessonId}" does not match filename "${path.filename}"`,
    )
  }

  return lesson.questions.map((question) => {
    const questionResult = validatedMcqSchema.safeParse(question)
    if (!questionResult.success) {
      invalidContent(
        path.relativePath,
        questionResult.error.issues.map((issue) => issue.message).join('; '),
      )
    }

    return {
      questionId: questionResult.data.id,
      answerIndex: questionResult.data.answerIndex,
    }
  })
}

/**
 * ファイル内容から同期対象だけを抽出する。ファイルI/Oを持たないためテスト可能。
 */
export function createContentSyncPayload(
  files: readonly ContentSourceFile[],
  userId: string,
): ContentSyncPayload {
  const questions: ContentSyncQuestion[] = []
  const questionPaths = new Map<string, string>()

  for (const file of [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
    const path = contentPathFor(file.relativePath)
    const frontmatter = frontmatterFor(path.relativePath, file.source)

    if (path.filename === 'index.md') {
      validateTopicFile(path, frontmatter)
      continue
    }

    for (const question of validateLessonFile(path, frontmatter)) {
      const firstPath = questionPaths.get(question.questionId)
      if (firstPath) {
        invalidContent(
          path.relativePath,
          `questionId "${question.questionId}" is also defined in "${firstPath}"`,
        )
      }

      questionPaths.set(question.questionId, path.relativePath)
      questions.push(question)
    }
  }

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
