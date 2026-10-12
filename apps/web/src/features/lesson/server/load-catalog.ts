import 'server-only'

import { domainKeySchema } from '@tsl/shared'

import { getLessonsByTopic, getTopicContent, getTopicRouteParams } from '@/lib/content'

import { catalogContentToViewModel } from '../mapper'
import type { LessonCatalogViewModel } from '../view-model'

export function loadLessonCatalog(): LessonCatalogViewModel {
  const entries = getTopicRouteParams().flatMap(({ domain, topic }) => {
    const domainResult = domainKeySchema.safeParse(domain)
    const content = getTopicContent(domain, topic)

    return domainResult.success && content
      ? [
          {
            domain: domainResult.data,
            content,
            lessonCount: getLessonsByTopic(domain, topic).length,
          },
        ]
      : []
  })

  return catalogContentToViewModel(entries)
}
