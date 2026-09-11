import type {
  AnalyticsHeatmapResponse,
  AnalyticsSummaryResponse,
  DueCountResponse,
  RecentActivityItem,
} from '@tsl/shared'

import type { DomainProgressData } from '@/features/shared/domain-progress'

export type DashboardStaticViewModel = {
  continueHref: string
  continueTitle?: string
  continueEstimatedMinutes?: number
  continueQuestionCount?: number
  learnHref?: string
  quizHref?: string
}

/** ダッシュボードの due card / navigation badge が受け取る表示契約。 */
export type DashboardDueViewModel = DueCountResponse

export type DashboardActivityViewModel = RecentActivityItem & {
  lessonTitle: string | null
}

export type DashboardDomainViewModel = DomainProgressData

export type DashboardViewModel = {
  summary: AnalyticsSummaryResponse
  heatmap: AnalyticsHeatmapResponse
  domains: DashboardDomainViewModel[]
  activity: DashboardActivityViewModel[]
}
