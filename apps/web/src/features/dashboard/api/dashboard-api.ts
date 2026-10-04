import {
  type AnalyticsHeatmapResponse,
  type AnalyticsSummaryResponse,
  type DomainsResponse,
  type DueCountResponse,
  type RecentActivityResponse,
  analyticsHeatmapResponseSchema,
  analyticsRequestSchema,
  analyticsSummaryResponseSchema,
  domainsResponseSchema,
  dueCountResponseSchema,
  recentActivityResponseSchema,
} from '@tsl/shared'

import { type ApiClient, requestJson } from '@/lib/api'

/** ダッシュボードで使う due 件数エンドポイントの型安全な境界。 */
export async function fetchDueCount(client: ApiClient): Promise<DueCountResponse> {
  const response = await requestJson(
    () => client.dashboard['due-count'].$get(),
    '復習件数の取得に失敗しました。',
  )

  return dueCountResponseSchema.parse(response)
}

export async function fetchDashboardSummary(client: ApiClient): Promise<AnalyticsSummaryResponse> {
  const response = await requestJson(
    () => client.analytics.summary.$get({ query: analyticsRequestSchema.parse({}) }),
    '学習サマリーの取得に失敗しました。',
  )

  return analyticsSummaryResponseSchema.parse(response)
}

export async function fetchDashboardHeatmap(client: ApiClient): Promise<AnalyticsHeatmapResponse> {
  const response = await requestJson(
    () => client.analytics.heatmap.$get({ query: analyticsRequestSchema.parse({}) }),
    '学習コントリビューションの取得に失敗しました。',
  )

  return analyticsHeatmapResponseSchema.parse(response)
}

export async function fetchDashboardDomains(client: ApiClient): Promise<DomainsResponse> {
  const response = await requestJson(
    () => client.domains.$get({ query: {} }),
    '領域別進捗の取得に失敗しました。',
  )

  return domainsResponseSchema.parse(response)
}

export async function fetchRecentActivity(client: ApiClient): Promise<RecentActivityResponse> {
  const response = await requestJson(
    () => client.activity.recent.$get({ query: analyticsRequestSchema.parse({}) }),
    '最近のアクティビティの取得に失敗しました。',
  )

  return recentActivityResponseSchema.parse(response)
}
