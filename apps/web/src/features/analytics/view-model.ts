import type { AnalyticsSummaryResponse, AnalyticsWeeklyDay, MistakeItem } from '@tsl/shared'

export type AnalyticsWeeklyViewModel = AnalyticsWeeklyDay & {
  weekdayLabel: string
}

export type AnalyticsMistakeViewModel = MistakeItem

export type AnalyticsViewModel = {
  summary: AnalyticsSummaryResponse
  weekly: AnalyticsWeeklyViewModel[]
  mistakes: AnalyticsMistakeViewModel[]
}
