import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  AnalyticsHeatmapResponse,
  AnalyticsSummaryResponse,
  DomainsResponse,
  RecentActivityResponse,
} from '@tsl/shared'

const createServerApiClient = vi.hoisted(() => vi.fn())
const getLessonRouteParams = vi.hoisted(() =>
  vi.fn((): { domain: string; topic: string; lesson: string }[] => []),
)
const getLessonContent = vi.hoisted(() => vi.fn())
const getOrderedTopicRoutes = vi.hoisted(() => vi.fn())
const fetchDashboardSummary = vi.hoisted(() => vi.fn())
const fetchDashboardHeatmap = vi.hoisted(() => vi.fn())
const fetchDashboardDomains = vi.hoisted(() => vi.fn())
const fetchRecentActivity = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', () => ({ createServerApiClient }))
vi.mock('@/lib/content', () => ({
  getLessonContent,
  getLessonRouteParams,
  getOrderedTopicRoutes,
}))
vi.mock('../api/dashboard-api', () => ({
  fetchDashboardDomains,
  fetchDashboardHeatmap,
  fetchDashboardSummary,
  fetchRecentActivity,
}))

import { loadDashboard, loadDashboardStatic } from './load-dashboard'

const summary = {
  totalAnswerCount: 4,
  correctAnswerRate: 75,
  averageResponseTimeMs: 800,
  masteredQuestionCount: 2,
  currentStreakDays: 3,
  thisWeekStudyTimeMs: 120_000,
  retentionDistribution: { masteredCount: 2, learningCount: 1, dueCount: 1 },
} satisfies AnalyticsSummaryResponse

const heatmap = {
  days: Array.from({ length: 182 }, (_, index) => ({
    date: new Date(Date.parse('2026-03-04T00:00:00Z') + index * 86_400_000)
      .toISOString()
      .slice(0, 10),
    answerCount: index === 181 ? 2 : 0,
  })),
} satisfies AnalyticsHeatmapResponse

const domains = {
  domains: [
    {
      domain: 'security' as const,
      masteredQuestionCount: 1,
      totalQuestionCount: 2,
      masteryRate: 50,
      topicCount: 1,
      lessonCount: 1,
    },
    {
      domain: 'frontend' as const,
      masteredQuestionCount: 0,
      totalQuestionCount: 0,
      masteryRate: 0,
      topicCount: 0,
      lessonCount: 0,
    },
    {
      domain: 'backend' as const,
      masteredQuestionCount: 0,
      totalQuestionCount: 0,
      masteryRate: 0,
      topicCount: 0,
      lessonCount: 0,
    },
    {
      domain: 'architecture' as const,
      masteredQuestionCount: 0,
      totalQuestionCount: 0,
      masteryRate: 0,
      topicCount: 0,
      lessonCount: 0,
    },
  ],
} satisfies DomainsResponse

const activity = {
  items: [
    {
      id: 'lesson:lesson-1',
      type: 'lesson_viewed' as const,
      occurredAt: 1_700_000_000_000,
      lessonId: 'lesson-1',
    },
  ],
} satisfies RecentActivityResponse

function mockDashboardRequests(client: object) {
  createServerApiClient.mockResolvedValue(client)
  fetchDashboardSummary.mockResolvedValue(summary)
  fetchDashboardHeatmap.mockResolvedValue(heatmap)
  fetchDashboardDomains.mockResolvedValue(domains)
  fetchRecentActivity.mockResolvedValue(activity)
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe('loadDashboardStatic', () => {
  afterEach(() => {
    createServerApiClient.mockReset()
    fetchDashboardSummary.mockReset()
    fetchDashboardHeatmap.mockReset()
    fetchDashboardDomains.mockReset()
    fetchRecentActivity.mockReset()
    getLessonRouteParams.mockReset()
    getLessonRouteParams.mockReturnValue([])
    getLessonContent.mockReset()
    getOrderedTopicRoutes.mockReset()
  })

  it('uses /home when no bundled lesson is available', () => {
    expect(loadDashboardStatic()).toEqual({
      continueHref: '/home',
      learnHref: undefined,
      quizHref: undefined,
    })
  })

  it('exposes the first bundled lesson metadata for the next-lesson card', () => {
    getLessonRouteParams.mockReturnValue([
      { domain: 'security', topic: 'xss', lesson: 'security-xss-01' },
    ])
    getLessonContent.mockReturnValue({
      title: 'XSSを防ぐ安全な画面表示',
      estimatedMinutes: 18,
      questions: [{ id: 'q1' }],
    })

    expect(loadDashboardStatic()).toEqual({
      continueHref: '/learn/security/xss/security-xss-01',
      continueTitle: 'XSSを防ぐ安全な画面表示',
      continueEstimatedMinutes: 18,
      continueQuestionCount: 1,
      learnHref: '/learn/security/xss/security-xss-01',
      quizHref: '/quiz/security-xss-01',
    })
  })
})

describe('loadDashboard', () => {
  afterEach(() => {
    createServerApiClient.mockReset()
    fetchDashboardSummary.mockReset()
    fetchDashboardHeatmap.mockReset()
    fetchDashboardDomains.mockReset()
    fetchRecentActivity.mockReset()
    getLessonRouteParams.mockReset()
    getLessonRouteParams.mockReturnValue([])
    getLessonContent.mockReset()
    getOrderedTopicRoutes.mockReset()
  })

  it('connects once, fetches all dashboard APIs in parallel, and joins content metadata', async () => {
    const client = { name: 'server-client' }
    const summaryRequest = deferred<AnalyticsSummaryResponse>()
    const heatmapRequest = deferred<AnalyticsHeatmapResponse>()
    const domainsRequest = deferred<DomainsResponse>()
    const activityRequest = deferred<RecentActivityResponse>()
    const started: string[] = []
    createServerApiClient.mockReturnValue(client)
    fetchDashboardSummary.mockImplementation(() => {
      started.push('summary')
      return summaryRequest.promise
    })
    fetchDashboardHeatmap.mockImplementation(() => {
      started.push('heatmap')
      return heatmapRequest.promise
    })
    fetchDashboardDomains.mockImplementation(() => {
      started.push('domains')
      return domainsRequest.promise
    })
    fetchRecentActivity.mockImplementation(() => {
      started.push('activity')
      return activityRequest.promise
    })
    getOrderedTopicRoutes.mockReturnValue([
      { domain: 'security', topic: 'xss', order: 2 },
      { domain: 'unknown', topic: 'invalid', order: 0 },
      { domain: 'security', topic: 'csrf', order: 1 },
    ])
    getLessonRouteParams.mockReturnValue([{ domain: 'security', topic: 'xss', lesson: 'lesson-1' }])
    getLessonContent.mockImplementation((lesson: string) =>
      lesson === 'lesson-1' ? { title: 'XSS lesson' } : undefined,
    )

    const viewModelPromise = loadDashboard()
    await Promise.resolve()
    await Promise.resolve()

    expect(started).toEqual(['summary', 'heatmap', 'domains', 'activity'])
    expect(createServerApiClient).toHaveBeenCalledOnce()
    expect(fetchDashboardSummary).toHaveBeenCalledWith(client)
    expect(fetchDashboardHeatmap).toHaveBeenCalledWith(client)
    expect(fetchDashboardDomains).toHaveBeenCalledWith(client)
    expect(fetchRecentActivity).toHaveBeenCalledWith(client)

    summaryRequest.resolve(summary)
    heatmapRequest.resolve(heatmap)
    domainsRequest.resolve(domains)
    activityRequest.resolve(activity)
    const viewModel = await viewModelPromise

    expect(viewModel.domains[0]).toMatchObject({
      label: 'セキュリティ',
      firstTopicHref: '/learn/security/csrf',
    })
    expect(viewModel.domains).not.toContainEqual(
      expect.objectContaining({ firstTopicHref: '/learn/unknown/invalid' }),
    )
    expect(viewModel.activity[0]).toMatchObject({ lessonTitle: 'XSS lesson' })
  })

  it('propagates an API failure to the route error boundary', async () => {
    const client = { name: 'server-client' }
    mockDashboardRequests(client)
    const failure = new Error('heatmap unavailable')
    fetchDashboardHeatmap.mockRejectedValue(failure)

    await expect(loadDashboard()).rejects.toBe(failure)
    expect(createServerApiClient).toHaveBeenCalledOnce()
  })
})
