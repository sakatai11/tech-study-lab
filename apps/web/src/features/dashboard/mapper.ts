import type {
  AnalyticsHeatmapResponse,
  AnalyticsSummaryResponse,
  DueCountResponse,
  RecentActivityResponse,
} from '@tsl/shared'

import type {
  DashboardActivityViewModel,
  DashboardDueViewModel,
  DashboardViewModel,
} from './view-model'

/** API の due 件数 DTO をダッシュボード表示用データへ正規化する。 */
export function dueCountToViewModel({ dueCount }: DueCountResponse): DashboardDueViewModel {
  return { dueCount }
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
