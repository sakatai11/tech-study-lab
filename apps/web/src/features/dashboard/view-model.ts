import type {
  AnalyticsHeatmapResponse,
  AnalyticsSummaryResponse,
  DomainKey,
  DomainsResponse,
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

type DomainSummary = DomainsResponse['domains'][number]

export type DashboardDomainViewModel = DomainSummary & {
  label: string
  firstTopicHref?: string
}

export type DashboardTopicRoute = {
  domain: DomainKey
  topic: string
  order: number
}

export type DashboardViewModel = {
  summary: AnalyticsSummaryResponse
  heatmap: AnalyticsHeatmapResponse
  domains: DashboardDomainViewModel[]
  activity: DashboardActivityViewModel[]
}
