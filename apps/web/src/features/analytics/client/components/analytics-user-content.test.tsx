// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AnalyticsSummaryResponse,
  AnalyticsWeeklyResponse,
  MistakesResponse,
} from '@tsl/shared'

import { invalidateClientData } from '@/lib/client-data-invalidation'
import { clearClientQueryCache } from '@/lib/use-client-query'

const api = vi.hoisted(() => ({
  createBrowserApiClient: vi.fn(() => ({ name: 'browser-client' })),
  fetchAnalyticsSummary: vi.fn(),
  fetchAnalyticsWeekly: vi.fn(),
  fetchAnalyticsMistakes: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  createBrowserApiClient: api.createBrowserApiClient,
}))
vi.mock('../../api/analytics-api', () => ({
  fetchAnalyticsSummary: api.fetchAnalyticsSummary,
  fetchAnalyticsWeekly: api.fetchAnalyticsWeekly,
  fetchAnalyticsMistakes: api.fetchAnalyticsMistakes,
}))

import { AnalyticsUserContent } from './analytics-user-content'

const summary = {
  totalAnswerCount: 12,
  correctAnswerRate: 75,
  averageResponseTimeMs: 1_500,
  masteredQuestionCount: 2,
  currentStreakDays: 3,
  thisWeekStudyTimeMs: 120_000,
  retentionDistribution: { masteredCount: 2, learningCount: 1, dueCount: 1 },
} satisfies AnalyticsSummaryResponse

const weekly = {
  days: Array.from({ length: 7 }, (_, index) => ({
    date: `2026-11-0${index + 1}`,
    weekday: index + 1,
    answerCount: index,
  })),
} satisfies AnalyticsWeeklyResponse

const mistakes = { items: [] } satisfies MistakesResponse

describe('AnalyticsUserContent [ADR-0019]', () => {
  beforeEach(() => {
    api.fetchAnalyticsSummary.mockResolvedValue(summary)
    api.fetchAnalyticsWeekly.mockResolvedValue(weekly)
    api.fetchAnalyticsMistakes.mockResolvedValue(mistakes)
  })

  afterEach(() => {
    cleanup()
    clearClientQueryCache()
    vi.clearAllMocks()
  })

  it('shows the loading state, then the analytics fetched with one browser client', async () => {
    render(<AnalyticsUserContent />)

    expect(screen.getByRole('status').textContent).toContain('学習分析を読み込んでいます')
    expect(await screen.findByText('総解答数')).toBeTruthy()
    expect(api.createBrowserApiClient).toHaveBeenCalledOnce()
    expect(api.fetchAnalyticsWeekly).toHaveBeenCalledWith({
      name: 'browser-client',
    })
  })

  it('shows an error with a retry when a request fails', async () => {
    api.fetchAnalyticsMistakes.mockRejectedValueOnce(new Error('mistakes unavailable'))
    render(<AnalyticsUserContent />)

    expect(await screen.findByText('学習分析を読み込めませんでした')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(await screen.findByText('総解答数')).toBeTruthy()
  })

  it('loads again after study activity is recorded', async () => {
    render(<AnalyticsUserContent />)
    await screen.findByText('総解答数')

    act(() => invalidateClientData('study-activity'))

    await waitFor(() => expect(api.fetchAnalyticsSummary).toHaveBeenCalledTimes(2))
  })
})
