// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AnalyticsHeatmapResponse,
  AnalyticsSummaryResponse,
  RecentActivityResponse,
} from '@tsl/shared'

import { invalidateClientData } from '@/lib/client-data-invalidation'
import { clearClientQueryCache } from '@/lib/use-client-query'

const api = vi.hoisted(() => ({
  createBrowserApiClient: vi.fn(() => ({ name: 'browser-client' })),
  fetchDueCount: vi.fn(),
  fetchDashboardSummary: vi.fn(),
  fetchDashboardHeatmap: vi.fn(),
  fetchRecentActivity: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  createBrowserApiClient: api.createBrowserApiClient,
}))
vi.mock('../../api/dashboard-api', () => ({
  fetchDueCount: api.fetchDueCount,
  fetchDashboardSummary: api.fetchDashboardSummary,
  fetchDashboardHeatmap: api.fetchDashboardHeatmap,
  fetchRecentActivity: api.fetchRecentActivity,
}))

import { DashboardUserSections } from './dashboard-user-sections'

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

const lessonTitles = { 'lesson-1': 'XSS lesson' }

describe('DashboardUserSections [ADR-0019]', () => {
  beforeEach(() => {
    api.fetchDueCount.mockResolvedValue({ dueCount: 3 })
    api.fetchDashboardSummary.mockResolvedValue(summary)
    api.fetchDashboardHeatmap.mockResolvedValue(heatmap)
    api.fetchRecentActivity.mockResolvedValue(activity)
  })

  afterEach(() => {
    cleanup()
    clearClientQueryCache()
    vi.clearAllMocks()
  })

  it('renders the loading state before mount-time requests finish', () => {
    api.fetchDashboardSummary.mockReturnValue(new Promise(() => {}))
    render(<DashboardUserSections lessonTitles={lessonTitles} />)

    expect(screen.getByRole('status').textContent).toContain('学習の状況を読み込んでいます')
  })

  it('starts all four dashboard requests before any of them finishes', async () => {
    const started: string[] = []
    const pending = (name: string) => () => {
      started.push(name)
      return new Promise<never>(() => {})
    }
    api.fetchDueCount.mockImplementation(pending('due'))
    api.fetchDashboardSummary.mockImplementation(pending('summary'))
    api.fetchDashboardHeatmap.mockImplementation(pending('heatmap'))
    api.fetchRecentActivity.mockImplementation(pending('activity'))

    render(<DashboardUserSections lessonTitles={lessonTitles} />)

    await waitFor(() => expect(started).toEqual(['due', 'summary', 'heatmap', 'activity']))
  })

  it('fetches the dashboard APIs with one browser client and joins lesson titles', async () => {
    render(<DashboardUserSections lessonTitles={lessonTitles} />)

    expect(await screen.findByText('教材「XSS lesson」を閲覧しました')).toBeTruthy()
    expect(screen.getByRole('link', { name: '復習を始める' })).toBeTruthy()
    expect(api.createBrowserApiClient).toHaveBeenCalledOnce()
    for (const request of [
      api.fetchDueCount,
      api.fetchDashboardSummary,
      api.fetchDashboardHeatmap,
      api.fetchRecentActivity,
    ]) {
      expect(request).toHaveBeenCalledWith({ name: 'browser-client' })
    }
  })

  it('keeps the screen and the review link when only the due count fails', async () => {
    api.fetchDueCount.mockRejectedValue(new Error('due unavailable'))
    render(<DashboardUserSections lessonTitles={lessonTitles} />)

    expect(await screen.findByText(/復習件数を取得できませんでした/)).toBeTruthy()
    expect(screen.getByText('最近のアクティビティ')).toBeTruthy()
  })

  it('shows one screen-level error with a retry when a dashboard API fails', async () => {
    api.fetchDashboardHeatmap.mockRejectedValueOnce(new Error('heatmap unavailable'))
    render(<DashboardUserSections lessonTitles={lessonTitles} />)

    expect(await screen.findByText('ダッシュボードを読み込めませんでした')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))

    expect(await screen.findByText('最近のアクティビティ')).toBeTruthy()
  })

  it('shows the kept data at once on return and does not request again while it is fresh', async () => {
    const first = render(<DashboardUserSections lessonTitles={lessonTitles} />)
    await screen.findByText('最近のアクティビティ')
    first.unmount()

    render(<DashboardUserSections lessonTitles={lessonTitles} />)

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('最近のアクティビティ')).toBeTruthy()
    expect(api.fetchDashboardSummary).toHaveBeenCalledTimes(1)
  })

  it('keeps the data and offers a retry when a refetch after recording fails', async () => {
    render(<DashboardUserSections lessonTitles={lessonTitles} />)
    await screen.findByText('最近のアクティビティ')
    api.fetchDashboardSummary.mockRejectedValueOnce(new Error('offline'))

    act(() => invalidateClientData('study-activity'))

    expect(await screen.findByText(/最新の内容を読み込めませんでした/)).toBeTruthy()
    expect(screen.getByText('最近のアクティビティ')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    await waitFor(() => expect(screen.queryByText(/最新の内容を読み込めませんでした/)).toBeNull())
  })

  it('loads again after study activity is recorded', async () => {
    render(<DashboardUserSections lessonTitles={lessonTitles} />)
    await screen.findByText('最近のアクティビティ')

    act(() => invalidateClientData('study-activity'))

    await waitFor(() => expect(api.fetchDashboardSummary).toHaveBeenCalledTimes(2))
  })
})
