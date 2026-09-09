import { DOMAIN_LABELS, type DomainKey, type DomainsResponse } from '@tsl/shared'

export type DomainTopicRoute = {
  domain: DomainKey
  topic: string
  order: number
}

export type DomainProgressViewModel = DomainsResponse['domains'][number] & {
  label: string
  firstTopicHref?: string
}

export function domainsToProgressViewModel(
  response: DomainsResponse,
  topicRoutes: readonly DomainTopicRoute[] = [],
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
