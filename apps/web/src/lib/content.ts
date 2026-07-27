import 'server-only'

import type { BundledLesson, BundledTopic, McqQuestion } from '@tsl/shared'

import { bundledContent } from './generated-content'

const lessonsById = new Map(
  bundledContent.lessons.map((lesson) => [lesson.lessonId, lesson] as const),
)
const questionsById = new Map(
  bundledContent.questions.map((question) => [question.id, question] as const),
)

/** Returns Markdown and validated frontmatter for a lesson, or undefined when it is not bundled. */
export function getLessonContent(lessonId: string): BundledLesson | undefined {
  return lessonsById.get(lessonId)
}

/** Returns a topic's lessons in their stable lessonId order. */
export function getLessonsByTopic(domain: string, topic: string): BundledLesson[] {
  return bundledContent.lessons.filter(
    (lesson) => lesson.domain === domain && lesson.topic === topic,
  )
}

/** Returns the shared questionId index used by quiz and review loaders. */
export function getBundledQuestions(): ReadonlyMap<string, McqQuestion> {
  return questionsById
}

export function getQuestionById(questionId: string): McqQuestion | undefined {
  return questionsById.get(questionId)
}

/** Returns a topic index and its overview Markdown, or undefined when it is not bundled. */
export function getTopicContent(domain: string, topic: string): BundledTopic | undefined {
  const relativePath = `${domain}/${topic}/index.md`
  return bundledContent.topics.find((candidate) => candidate.relativePath === relativePath)
}
