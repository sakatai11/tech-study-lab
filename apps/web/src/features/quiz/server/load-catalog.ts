import 'server-only'

import { domainKeySchema } from '@tsl/shared'

import { getLessonsByTopic, getTopicContent, getTopicRouteParams } from '@/lib/content'

import { quizCatalogContentToViewModel } from '../mapper'
import type { QuizCatalogViewModel } from '../view-model'

export function loadQuizCatalog(): QuizCatalogViewModel {
  const entries = getTopicRouteParams().flatMap(({ domain, topic }) => {
    const domainResult = domainKeySchema.safeParse(domain)
    const content = getTopicContent(domain, topic)

    return domainResult.success && content
      ? [{ domain: domainResult.data, content, lessons: getLessonsByTopic(domain, topic) }]
      : []
  })

  return quizCatalogContentToViewModel(entries)
}
