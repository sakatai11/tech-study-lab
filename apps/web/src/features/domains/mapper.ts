import { DOMAIN_LABELS, type DomainKey, type DomainsResponse } from '@tsl/shared'

import type { DomainProgressViewModel, DomainTopicRoute, DomainsViewModel } from './view-model'

function domainsToProgressViewModel(
  response: DomainsResponse,
  topicRoutes: readonly DomainTopicRoute[],
): DomainProgressViewModel[] {
  const firstTopicByDomain = new Map<DomainKey, DomainTopicRoute>()
  for (const route of topicRoutes) {
    const current = firstTopicByDomain.get(route.domain)
    if (!current || route.order < current.order) {
      firstTopicByDomain.set(route.domain, route)
    }
  }

  return response.domains.map((summary) => {
    const firstTopic = firstTopicByDomain.get(summary.domain)?.topic

    return {
      ...summary,
      label: DOMAIN_LABELS[summary.domain].label,
      firstTopicHref: firstTopic ? `/learn/${summary.domain}/${firstTopic}` : undefined,
    }
  })
}

export function domainsToViewModel(
  response: DomainsResponse,
  topicRoutes: readonly DomainTopicRoute[] = [],
): DomainsViewModel {
  return {
    domains: domainsToProgressViewModel(response, topicRoutes),
  }
}
