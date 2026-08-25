import { DOMAIN_LABELS, type DomainKey, type DomainsResponse } from '@tsl/shared'

import type { DomainTopicRoute, DomainsViewModel } from './view-model'

export function domainsToViewModel(
  response: DomainsResponse,
  topicRoutes: readonly DomainTopicRoute[] = [],
): DomainsViewModel {
  const firstTopicByDomain = new Map<DomainKey, DomainTopicRoute>()
  for (const route of topicRoutes) {
    const current = firstTopicByDomain.get(route.domain)
    if (!current || route.order < current.order) {
      firstTopicByDomain.set(route.domain, route)
    }
  }

  return {
    domains: response.domains.map((summary) => {
      const firstTopic = firstTopicByDomain.get(summary.domain)?.topic

      return {
        ...summary,
        label: DOMAIN_LABELS[summary.domain].label,
        firstTopicHref: firstTopic ? `/learn/${summary.domain}/${firstTopic}` : undefined,
      }
    }),
  }
}
