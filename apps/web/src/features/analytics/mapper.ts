import type {
  AnalyticsSummaryResponse,
  AnalyticsWeeklyResponse,
  MistakesResponse,
} from '@tsl/shared'

import type { AnalyticsViewModel } from './view-model'

const weekdayLabels = ['', '月', '火', '水', '木', '金', '土', '日'] as const

export function analyticsToViewModel(
  summary: AnalyticsSummaryResponse,
  weekly: AnalyticsWeeklyResponse,
  mistakes: MistakesResponse,
): AnalyticsViewModel {
  return {
    summary,
    weekly: weekly.days.map((day) => ({
      ...day,
      weekdayLabel: weekdayLabels[day.weekday] ?? '',
    })),
    mistakes: mistakes.items,
  }
}
