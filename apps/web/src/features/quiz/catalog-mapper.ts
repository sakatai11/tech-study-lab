import {
  type BundledLesson,
  type BundledTopic,
  DOMAIN_LABELS,
  type DomainKey,
  domainKeySchema,
} from '@tsl/shared'

import type { QuizCatalogViewModel } from './view-model'

export function quizCatalogToViewModel(
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
                lessonId: lesson.lessonId,
                title: lesson.title,
                questionCount: lesson.questions.length,
                href: `/quiz/${lesson.lessonId}`,
              })),
          })),
      }))
      .filter(({ topics }) => topics.length > 0),
  }
}
