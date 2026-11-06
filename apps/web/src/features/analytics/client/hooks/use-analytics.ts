'use client'

import { createBrowserApiClient } from '@/lib/api'
import { type ClientQueryResult, useClientQuery } from '@/lib/use-client-query'

import {
  fetchAnalyticsMistakes,
  fetchAnalyticsSummary,
  fetchAnalyticsWeekly,
} from '../../api/analytics-api'
import { analyticsToViewModel } from '../../mapper'
import type { AnalyticsViewModel } from '../../view-model'

async function loadAnalytics(): Promise<AnalyticsViewModel> {
  const client = createBrowserApiClient()
  const [summary, weekly, mistakes] = await Promise.all([
    fetchAnalyticsSummary(client),
    fetchAnalyticsWeekly(client),
    fetchAnalyticsMistakes(client),
  ])

  return analyticsToViewModel(summary, weekly, mistakes)
}

/** 学習分析をブラウザで取得する。記録後は study-activity で取得し直す（ADR-0019）。 */
export function useAnalytics(): ClientQueryResult<AnalyticsViewModel> {
  return useClientQuery(loadAnalytics, { revalidateOn: ['study-activity'] })
}
