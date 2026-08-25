import 'server-only'

import type { BundledLesson, BundledTopic, McqQuestion } from '@tsl/shared'

import { bundledContent } from './generated-content'

const lessonsById = new Map(
  bundledContent.lessons.map((lesson) => [lesson.lessonId, lesson] as const),
)
const questionsById = new Map(
  bundledContent.questions.map((question) => [question.id, question] as const),
)

/** lesson の Markdown と検証済み frontmatter を返す。bundle されていなければ undefined。 */
export function getLessonContent(lessonId: string): BundledLesson | undefined {
  return lessonsById.get(lessonId)
}

/** topic 配下の lesson を、安定した lessonId 順で返す。 */
export function getLessonsByTopic(domain: string, topic: string): BundledLesson[] {
  return bundledContent.lessons.filter(
    (lesson) => lesson.domain === domain && lesson.topic === topic,
  )
}

/** quiz と review の loader が共有する questionId index を返す。 */
export function getBundledQuestions(): ReadonlyMap<string, McqQuestion> {
  return questionsById
}

export function getQuestionById(questionId: string): McqQuestion | undefined {
  return questionsById.get(questionId)
}

/** topic の index と概要 Markdown を返す。bundle されていなければ undefined。 */
export function getTopicContent(domain: string, topic: string): BundledTopic | undefined {
  const relativePath = `${domain}/${topic}/index.md`
  return bundledContent.topics.find((candidate) => candidate.relativePath === relativePath)
}

/**
 * `generateStaticParams` に渡す route params。
 * Cache Components では動的セグメントを build 時に列挙できないと、content 由来の route が
 * prerender されずリクエスト時のシェルに落ちるため、全件を返す（design.md 8.2）。
 */
export function getLessonRouteParams(): {
  domain: string
  topic: string
  lesson: string
}[] {
  return bundledContent.lessons.map((lesson) => ({
    domain: lesson.domain,
    topic: lesson.topic,
    lesson: lesson.lessonId,
  }))
}

/**
 * `/learn/[domain]/[topic]` の route params。
 * lesson ではなく topic の index を一次データにする。topic は `index.md` があれば bundle される
 * ため、lesson から導出すると lesson 未執筆の topic を取りこぼす。
 */
export function topicRouteParamsFrom(
  topics: readonly BundledTopic[],
): { domain: string; topic: string }[] {
  return topics.flatMap((entry) => {
    const [domain] = entry.relativePath.split('/')

    return domain ? [{ domain, topic: entry.topic }] : []
  })
}

export function getTopicRouteParams(): { domain: string; topic: string }[] {
  return topicRouteParamsFrom(bundledContent.topics)
}

/** 領域カードの遷移先選択に使う、frontmatter の表示順付き topic route。 */
export function getOrderedTopicRoutes(): { domain: string; topic: string; order: number }[] {
  return bundledContent.topics.flatMap((entry) => {
    const [domain] = entry.relativePath.split('/')

    return domain ? [{ domain, topic: entry.topic, order: entry.order }] : []
  })
}

/** `/quiz/[lesson]` の route params。 */
export function getQuizRouteParams(): { lesson: string }[] {
  return bundledContent.lessons.map((lesson) => ({ lesson: lesson.lessonId }))
}
