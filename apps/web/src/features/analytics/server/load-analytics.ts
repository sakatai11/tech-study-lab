import 'server-only'

import { connection } from 'next/server'

import { createServerApiClient } from '@/lib/api'

import {
  fetchAnalyticsMistakes,
  fetchAnalyticsSummary,
  fetchAnalyticsWeekly,
} from '../api/analytics-api'
import { analyticsToViewModel } from '../mapper'
import type { AnalyticsViewModel } from '../view-model'

export async function loadAnalytics(): Promise<AnalyticsViewModel> {
  await connection()
  const client = await createServerApiClient()
  const [summary, weekly, mistakes] = await Promise.all([
    fetchAnalyticsSummary(client),
    fetchAnalyticsWeekly(client),
    fetchAnalyticsMistakes(client),
  ])

  return analyticsToViewModel(summary, weekly, mistakes)
}
