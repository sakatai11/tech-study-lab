import type { BundledLesson, BundledTopic, DomainKey } from '@tsl/shared'
import { DOMAIN_LABELS, domainKeySchema } from '@tsl/shared'

import type { LessonCatalogViewModel, LessonViewModel, TopicViewModel } from './view-model'

export function catalogContentToViewModel(
  entries: { domain: DomainKey; content: BundledTopic; lessonCount: number }[],
): LessonCatalogViewModel {
  return {
    domains: [...domainKeySchema.options]
      .sort((a, b) => DOMAIN_LABELS[a].order - DOMAIN_LABELS[b].order)
      .map((domain) => ({
        domain,
        label: DOMAIN_LABELS[domain].label,
        topics: entries
          .filter((entry) => entry.domain === domain)
          .sort(
            (a, b) =>
              a.content.order - b.content.order ||
              a.content.topic.localeCompare(b.content.topic, 'en'),
          )
          .map(({ content, lessonCount }) => ({
            topic: content.topic,
            title: content.title,
            lessonCount,
            ...(lessonCount > 0 ? { href: `/learn/${domain}/${content.topic}` } : {}),
          })),
      })),
  }
}

export function topicContentToViewModel(
  topic: BundledTopic,
  lessons: BundledLesson[],
  domain: DomainKey,
): TopicViewModel {
  return {
    domain,
    topic: topic.topic,
    title: topic.title,
    overviewMarkdown: topic.body,
    lessons: lessons.map((lesson) => ({
      id: lesson.lessonId,
      title: lesson.title,
      questionCount: lesson.questions.length,
    })),
  }
}

export function lessonContentToViewModel(content: BundledLesson): LessonViewModel {
  return {
    domain: content.domain,
    topic: content.topic,
    id: content.lessonId,
    title: content.title,
    markdownBody: content.body,
    questions: content.questions.map(({ id, prompt, choices }) => ({
      id,
      prompt,
      choices: [...choices],
    })),
  }
}
