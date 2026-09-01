import {
  type AnalyticsSummaryResponse,
  type AnalyticsWeeklyResponse,
  type MistakesResponse,
  analyticsRequestSchema,
  analyticsSummaryResponseSchema,
  analyticsWeeklyResponseSchema,
  mistakesResponseSchema,
} from '@tsl/shared'

import { type ApiClient, requestJson } from '@/lib/api'

export async function fetchAnalyticsSummary(client: ApiClient): Promise<AnalyticsSummaryResponse> {
  const response = await requestJson(
    () => client.analytics.summary.$get({ query: analyticsRequestSchema.parse({}) }),
    '学習サマリーの取得に失敗しました。',
  )
  return analyticsSummaryResponseSchema.parse(response)
}

export async function fetchAnalyticsWeekly(client: ApiClient): Promise<AnalyticsWeeklyResponse> {
  const response = await requestJson(
    () => client.analytics.weekly.$get({ query: analyticsRequestSchema.parse({}) }),
    '週間アクティビティの取得に失敗しました。',
  )
  return analyticsWeeklyResponseSchema.parse(response)
}

export async function fetchAnalyticsMistakes(client: ApiClient): Promise<MistakesResponse> {
  const response = await requestJson(
    () => client.analytics.mistakes.$get({ query: analyticsRequestSchema.parse({}) }),
    '誤答ランキングの取得に失敗しました。',
  )
  return mistakesResponseSchema.parse(response)
}
