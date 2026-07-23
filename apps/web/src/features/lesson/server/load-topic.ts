import 'server-only'

import { domainKeySchema } from '@tsl/shared'

import { getLessonsByTopic, getTopicContent } from '@/lib/content'

import { type TopicViewModel, topicContentToViewModel } from '../view-model'

export function loadTopic(domain: string, topic: string): TopicViewModel | undefined {
  const domainResult = domainKeySchema.safeParse(domain)
  const topicContent = getTopicContent(domain, topic)

  if (!domainResult.success || !topicContent) {
    return undefined
  }

  return topicContentToViewModel(topicContent, getLessonsByTopic(domain, topic), domainResult.data)
}
