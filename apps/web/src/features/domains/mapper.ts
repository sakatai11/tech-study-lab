import { DOMAIN_LABELS, type DomainKey, type DomainsResponse } from '@tsl/shared'

import type { DomainTopicRoute, DomainsViewModel } from './view-model'

export function domainsToViewModel(
  response: DomainsResponse,
  topicRoutes: readonly DomainTopicRoute[] = [],
): DomainsViewModel {
  const firstTopicByDomain = new Map<DomainKey, string>()
  for (const route of topicRoutes) {
    if (!firstTopicByDomain.has(route.domain)) {
      firstTopicByDomain.set(route.domain, route.topic)
    }
  }

  return {
    domains: response.domains.map((summary) => {
      const firstTopic = firstTopicByDomain.get(summary.domain)

      return {
        ...summary,
        label: DOMAIN_LABELS[summary.domain].label,
        firstTopicHref: firstTopic ? `/learn/${summary.domain}/${firstTopic}` : undefined,
      }
    }),
  }
}

export function emptyDomainsViewModel(): DomainsViewModel {
  return domainsToViewModel({
    domains: (Object.keys(DOMAIN_LABELS) as DomainKey[]).map((domain) => ({
      domain,
      masteredQuestionCount: 0,
      totalQuestionCount: 0,
      masteryRate: 0,
      topicCount: 0,
      lessonCount: 0,
    })),
  })
}
