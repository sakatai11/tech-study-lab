import {
  type LessonFrontmatter,
  type McqQuestion,
  type TopicFrontmatter,
  domainKeySchema,
  topicFrontmatterSchema,
  validatedLessonFrontmatterSchema,
  validatedMcqSchema,
} from './schema/content'

export type ParsedContentSourceFile = {
  relativePath: string
  frontmatter: unknown
  body: string
}

type ContentPath = {
  domain: string
  topic: string
  filename: string
  relativePath: string
}

export type BundledTopic = TopicFrontmatter & {
  relativePath: string
  body: string
}

export type BundledLesson = Omit<LessonFrontmatter, 'questions'> & {
  relativePath: string
  body: string
  questions: McqQuestion[]
}

export type ContentBundle = {
  topics: BundledTopic[]
  lessons: BundledLesson[]
  questions: McqQuestion[]
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

function topicFor(path: ContentPath, file: ParsedContentSourceFile): BundledTopic {
  const result = topicFrontmatterSchema.safeParse(file.frontmatter)
  if (!result.success) {
    return invalidContent(
      path.relativePath,
      result.error.issues.map((issue) => issue.message).join('; '),
    )
  }

  if (result.data.topic !== path.topic) {
    return invalidContent(
      path.relativePath,
      `topic frontmatter "${result.data.topic}" does not match directory "${path.topic}"`,
    )
  }

  return { ...result.data, relativePath: path.relativePath, body: file.body }
}

function lessonFor(path: ContentPath, file: ParsedContentSourceFile): BundledLesson {
  const lessonResult = validatedLessonFrontmatterSchema.safeParse(file.frontmatter)
  if (!lessonResult.success) {
    return invalidContent(
      path.relativePath,
      lessonResult.error.issues.map((issue) => issue.message).join('; '),
    )
  }

  const lesson = lessonResult.data
  if (lesson.domain !== path.domain) {
    return invalidContent(
      path.relativePath,
      `domain frontmatter "${lesson.domain}" does not match directory "${path.domain}"`,
    )
  }
  if (lesson.topic !== path.topic) {
    return invalidContent(
      path.relativePath,
      `topic frontmatter "${lesson.topic}" does not match directory "${path.topic}"`,
    )
  }

  const filenameLessonId = path.filename.slice(0, -'.md'.length)
  if (lesson.lessonId !== filenameLessonId) {
    return invalidContent(
      path.relativePath,
      `lessonId "${lesson.lessonId}" does not match filename "${path.filename}"`,
    )
  }

  const questions = lesson.questions.map((question) => {
    const questionResult = validatedMcqSchema.safeParse(question)
    if (!questionResult.success) {
      return invalidContent(
        path.relativePath,
        questionResult.error.issues.map((issue) => issue.message).join('; '),
      )
    }

    return questionResult.data
  })

  return { ...lesson, questions, relativePath: path.relativePath, body: file.body }
}

/**
 * Parses already-extracted Markdown frontmatter and body into the content bundle.
 * File-system and Markdown parser dependencies stay at the call site so this runs in Node and Workers.
 */
export function createContentBundle(files: readonly ParsedContentSourceFile[]): ContentBundle {
  const topics: BundledTopic[] = []
  const lessons: BundledLesson[] = []
  const questions: McqQuestion[] = []
  const topicPaths = new Map<string, string>()
  const lessonPaths = new Map<string, string>()
  const questionPaths = new Map<string, string>()

  for (const file of [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
    const path = contentPathFor(file.relativePath)

    if (path.filename === 'index.md') {
      const topic = topicFor(path, file)
      const topicKey = `${path.domain}/${topic.topic}`
      const firstPath = topicPaths.get(topicKey)
      if (firstPath) {
        invalidContent(path.relativePath, `topic is also defined in "${firstPath}"`)
      }

      topicPaths.set(topicKey, path.relativePath)
      topics.push(topic)
      continue
    }

    const lesson = lessonFor(path, file)
    const firstLessonPath = lessonPaths.get(lesson.lessonId)
    if (firstLessonPath) {
      invalidContent(
        path.relativePath,
        `lessonId "${lesson.lessonId}" is also defined in "${firstLessonPath}"`,
      )
    }

    lessonPaths.set(lesson.lessonId, path.relativePath)
    lessons.push(lesson)

    for (const question of lesson.questions) {
      const firstPath = questionPaths.get(question.id)
      if (firstPath) {
        invalidContent(
          path.relativePath,
          `questionId "${question.id}" is also defined in "${firstPath}"`,
        )
      }

      questionPaths.set(question.id, path.relativePath)
      questions.push(question)
    }
  }

  topics.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  lessons.sort((a, b) => a.lessonId.localeCompare(b.lessonId))

  return { topics, lessons, questions }
}
