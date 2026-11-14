import type { BundledLesson, BundledTopic, DomainKey } from '@tsl/shared'
import { DOMAIN_LABELS, domainKeySchema } from '@tsl/shared'
import type { ElementContent, Root } from 'hast'

import type {
  LessonCatalogViewModel,
  LessonTocItemViewModel,
  LessonViewModel,
  TopicViewModel,
} from './view-model'

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
  overview: Root,
): TopicViewModel {
  return {
    domain,
    topic: topic.topic,
    title: topic.title,
    overview,
    lessons: lessons.map((lesson) => ({
      id: lesson.lessonId,
      title: lesson.title,
      questionCount: lesson.questions.length,
    })),
  }
}

function textContent(node: ElementContent): string {
  if (node.type === 'text') return node.value
  if (node.type === 'element') return node.children.map(textContent).join('')
  return ''
}

/** 本文直下の、id を持つ h2 を出現順に目次項目へ変換する。 */
export function lessonTocFromBody(body: Root): LessonTocItemViewModel[] {
  return body.children.flatMap((node) => {
    if (node.type !== 'element' || node.tagName !== 'h2') return []
    const { id } = node.properties
    const title = node.children.map(textContent).join('').trim()
    return typeof id === 'string' && id !== '' && title !== '' ? [{ id, title }] : []
  })
}

export function lessonContentToViewModel(content: BundledLesson, body: Root): LessonViewModel {
  return {
    domain: content.domain,
    topic: content.topic,
    id: content.lessonId,
    title: content.title,
    estimatedMinutes: content.estimatedMinutes,
    body,
    toc: lessonTocFromBody(body),
    questions: content.questions.map(({ id, prompt, choices }) => ({
      id,
      prompt,
      choices: [...choices],
    })),
  }
}
