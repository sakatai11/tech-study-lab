import {
  type BundledLesson,
  type BundledTopic,
  DOMAIN_LABELS,
  type DomainKey,
  domainKeySchema,
} from '@tsl/shared'

import { contentQuestionToQuizQuestion } from '../shared/quiz-question'

import type { QuizCatalogViewModel, QuizViewModel } from './view-model'

export function quizContentToViewModel(
  content: BundledLesson,
  nextLessonId?: string,
): QuizViewModel {
  return {
    domain: content.domain,
    topic: content.topic,
    lessonId: content.lessonId,
    title: content.title,
    questions: content.questions.map(contentQuestionToQuizQuestion),
    explanations: Object.fromEntries(
      content.questions.map((question) => [question.id, question.explanation]),
    ),
    nextLessonId,
  }
}

export function quizCatalogContentToViewModel(
  entries: { domain: DomainKey; content: BundledTopic; lessons: BundledLesson[] }[],
): QuizCatalogViewModel {
  return {
    domains: [...domainKeySchema.options]
      .sort((a, b) => DOMAIN_LABELS[a].order - DOMAIN_LABELS[b].order)
      .map((domain) => ({
        domain,
        label: DOMAIN_LABELS[domain].label,
        topics: entries
          .filter((entry) => entry.domain === domain && entry.lessons.length > 0)
          .sort(
            (a, b) =>
              a.content.order - b.content.order ||
              a.content.topic.localeCompare(b.content.topic, 'en'),
          )
          .map(({ content, lessons }) => ({
            topic: content.topic,
            title: content.title,
            lessons: [...lessons]
              .sort((a, b) => a.lessonId.localeCompare(b.lessonId, 'en'))
              .map((lesson) => ({
                id: lesson.lessonId,
                title: lesson.title,
                questionCount: lesson.questions.length,
                href: `/quiz/${lesson.lessonId}`,
              })),
          })),
      }))
      .filter((domain) => domain.topics.length > 0),
  }
}
