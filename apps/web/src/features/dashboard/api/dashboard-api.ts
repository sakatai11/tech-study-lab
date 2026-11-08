import {
  type AnalyticsHeatmapResponse,
  type AnalyticsSummaryResponse,
  type DueCountResponse,
  type RecentActivityResponse,
  analyticsHeatmapResponseSchema,
  analyticsRequestSchema,
  analyticsSummaryResponseSchema,
  dueCountResponseSchema,
  recentActivityResponseSchema,
} from '@tsl/shared'

import { type ApiClient, parseApiResponse, requestJson } from '@/lib/api'

/** ダッシュボードで使う due 件数エンドポイントの型安全な境界。 */
export async function fetchDueCount(client: ApiClient): Promise<DueCountResponse> {
  const response = await requestJson(
    () => client.dashboard['due-count'].$get(),
    '復習件数の取得に失敗しました。',
  )

  return parseApiResponse(dueCountResponseSchema, response)
}

export async function fetchDashboardSummary(client: ApiClient): Promise<AnalyticsSummaryResponse> {
  const response = await requestJson(
    () => client.analytics.summary.$get({ query: analyticsRequestSchema.parse({}) }),
    '学習サマリーの取得に失敗しました。',
  )

  return parseApiResponse(analyticsSummaryResponseSchema, response)
}

export async function fetchDashboardHeatmap(client: ApiClient): Promise<AnalyticsHeatmapResponse> {
  const response = await requestJson(
    () => client.analytics.heatmap.$get({ query: analyticsRequestSchema.parse({}) }),
    '学習コントリビューションの取得に失敗しました。',
  )

  return parseApiResponse(analyticsHeatmapResponseSchema, response)
}

export async function fetchRecentActivity(client: ApiClient): Promise<RecentActivityResponse> {
  const response = await requestJson(
    () => client.activity.recent.$get({ query: analyticsRequestSchema.parse({}) }),
    '最近のアクティビティの取得に失敗しました。',
  )

  return parseApiResponse(recentActivityResponseSchema, response)
}
