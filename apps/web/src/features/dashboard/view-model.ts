import type {
  AnalyticsHeatmapResponse,
  AnalyticsSummaryResponse,
  DueCountResponse,
  RecentActivityItem,
} from '@tsl/shared'

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

export type DashboardViewModel = {
  summary: AnalyticsSummaryResponse
  heatmap: AnalyticsHeatmapResponse
  activity: DashboardActivityViewModel[]
}

/** /home が1回の取得で表示するデータ。due 件数だけは取得に失敗しても画面を出す。 */
export type DashboardScreenViewModel = DashboardViewModel & {
  due: DashboardDueViewModel | null
}
