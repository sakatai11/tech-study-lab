import {
  type AnalyticsHeatmapResponse,
  type AnalyticsSummaryResponse,
  DOMAIN_LABELS,
  type DomainKey,
  type DomainsResponse,
  type DueCountResponse,
  type RecentActivityResponse,
} from '@tsl/shared'

import type {
  DashboardActivityViewModel,
  DashboardDomainViewModel,
  DashboardDueViewModel,
  DashboardTopicRoute,
  DashboardViewModel,
} from './view-model'

/** API の due 件数 DTO をダッシュボード表示用データへ正規化する。 */
export function dueCountToViewModel({ dueCount }: DueCountResponse): DashboardDueViewModel {
  return { dueCount }
}

/** Dashboard feature の DTO を dashboard 固有の表示用VMへ変換する。 */
export function dashboardDomainsToViewModel(
  response: DomainsResponse,
  topicRoutes: readonly DashboardTopicRoute[] = [],
): DashboardDomainViewModel[] {
  const firstTopicByDomain = new Map<DomainKey, DashboardTopicRoute>()
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

export function dashboardToViewModel(
  summary: AnalyticsSummaryResponse,
  heatmap: AnalyticsHeatmapResponse,
  domains: DashboardViewModel['domains'],
  activity: RecentActivityResponse,
  lessonTitles: ReadonlyMap<string, string>,
): DashboardViewModel {
  return {
    summary,
    heatmap,
    domains,
    activity: activity.items.map(
      (item): DashboardActivityViewModel => ({
        ...item,
        lessonTitle: item.lessonId ? (lessonTitles.get(item.lessonId) ?? item.lessonId) : null,
      }),
    ),
  }
}
