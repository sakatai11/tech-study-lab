import 'server-only'

import { domainKeySchema } from '@tsl/shared'

import { getLessonsByTopic, getTopicContent, getTopicRouteParams } from '@/lib/content'

import { topicContentToViewModel } from '../mapper'
import type { TopicViewModel } from '../view-model'

export function loadTopic(domain: string, topic: string): TopicViewModel | undefined {
  const domainResult = domainKeySchema.safeParse(domain)
  const topicContent = getTopicContent(domain, topic)

  if (!domainResult.success || !topicContent) {
    return undefined
  }

  return topicContentToViewModel(topicContent, getLessonsByTopic(domain, topic), domainResult.data)
}

/** Route params for `generateStaticParams`. page から lib/content を直接読まないための委譲。 */
export function listTopicRouteParams() {
  return getTopicRouteParams()
}
