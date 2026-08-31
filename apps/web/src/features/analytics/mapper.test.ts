import { describe, expect, it } from 'vitest'

import type {
  AnalyticsSummaryResponse,
  AnalyticsWeeklyResponse,
  MistakesResponse,
} from '@tsl/shared'

import { analyticsToViewModel } from './mapper'

const summary = {
  totalAnswerCount: 4,
  correctAnswerRate: 75,
  averageResponseTimeMs: 900,
  masteredQuestionCount: 2,
  currentStreakDays: 3,
  thisWeekStudyTimeMs: 120_000,
  retentionDistribution: { masteredCount: 1, learningCount: 2, dueCount: 1 },
} satisfies AnalyticsSummaryResponse

const weekly = {
  days: [
    { date: '2026-08-30', weekday: 7, answerCount: 1 },
    { date: '2026-08-31', weekday: 1, answerCount: 3 },
  ],
} as AnalyticsWeeklyResponse

const mistakes = {
  items: [{ questionId: 'q-1', incorrectRate: 50, answerCount: 2, incorrectAnswerCount: 1 }],
} satisfies MistakesResponse

describe('analyticsToViewModel', () => {
  it('adds localized weekday labels while preserving API statistics', () => {
    expect(analyticsToViewModel(summary, weekly, mistakes)).toEqual({
      summary,
      weekly: [
        { date: '2026-08-30', weekday: 7, weekdayLabel: '日', answerCount: 1 },
        { date: '2026-08-31', weekday: 1, weekdayLabel: '月', answerCount: 3 },
      ],
      mistakes: mistakes.items,
    })
  })
})
