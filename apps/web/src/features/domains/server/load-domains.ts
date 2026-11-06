import 'server-only'

import { domainKeySchema } from '@tsl/shared'

import { getOrderedTopicRoutes } from '@/lib/content'

import type { DomainTopicRoute } from '../view-model'

/**
 * 各領域の最初のトピックを選ぶための content 由来の route。ビルド時に page から
 * Client へ props で渡し、ユーザー固有の習得状況はブラウザで取得する（ADR-0019）。
 */
export function loadDomainTopicRoutes(): DomainTopicRoute[] {
  return getOrderedTopicRoutes().flatMap((route) => {
    const result = domainKeySchema.safeParse(route.domain)
    return result.success ? [{ domain: result.data, topic: route.topic, order: route.order }] : []
  })
}
