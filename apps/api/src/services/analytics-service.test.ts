import { describe, expect, it } from 'vitest'

import {
  type AnalyticsDeps,
  getAnalyticsMistakes,
  getAnalyticsSummary,
  getAnalyticsWeekly,
  recentUtcDays,
  utcWeekStart,
} from './analytics-service'

const now = Date.parse('2026-08-31T12:00:00.000Z')

function createDeps(overrides: Partial<AnalyticsDeps> = {}): AnalyticsDeps {
  return {
    findSummaryData: async () => ({
      totalAnswerCount: 0,
      correctAnswerCount: 0,
      responseTimeTotalMs: 0,
      responseTimeCount: 0,
      thisWeekResponseTimeTotalMs: 0,
      lessonViewCounts: [],
      activityDates: [],
      srsStates: [],
    }),
    findWeeklyAnswerCounts: async () => [],
    findMistakes: async () => [],
    ...overrides,
  }
}

describe('analytics service', () => {
  it('returns zero values for an empty user', async () => {
    await expect(getAnalyticsSummary(createDeps(), { userId: 'u1', now })).resolves.toEqual({
      totalAnswerCount: 0,
      correctAnswerRate: 0,
      averageResponseTimeMs: 0,
      masteredQuestionCount: 0,
      currentStreakDays: 0,
      thisWeekStudyTimeMs: 0,
      retentionDistribution: { masteredCount: 0, learningCount: 0, dueCount: 0 },
    })
  })

  it('rounds rates and averages, calculates study time, streak, and exclusive SRS buckets', async () => {
    const today = '2026-08-31'
    const yesterday = '2026-08-30'
    const twoDaysAgo = '2026-08-29'
    const result = await getAnalyticsSummary(
      createDeps({
        findSummaryData: async () => ({
          totalAnswerCount: 3,
          correctAnswerCount: 2,
          responseTimeTotalMs: 2_401,
          responseTimeCount: 3,
          thisWeekResponseTimeTotalMs: 1_001,
          lessonViewCounts: [{ lessonId: 'lesson-1', count: 2, estimatedMinutes: 5 }],
          activityDates: [today, yesterday, twoDaysAgo],
          srsStates: [
            { intervalDays: 21, dueAt: now + 1 },
            { intervalDays: 30, dueAt: now - 1 },
            { intervalDays: 3, dueAt: now + 1 },
          ],
        }),
      }),
      { userId: 'u1', now },
    )

    expect(result).toEqual({
      totalAnswerCount: 3,
      correctAnswerRate: 67,
      averageResponseTimeMs: 800,
      masteredQuestionCount: 2,
      currentStreakDays: 3,
      thisWeekStudyTimeMs: 601_001,
      retentionDistribution: { masteredCount: 1, learningCount: 1, dueCount: 1 },
    })
  })

  it('returns seven UTC days in chronological order and fills missing counts with zero', async () => {
    const result = await getAnalyticsWeekly(
      createDeps({
        findWeeklyAnswerCounts: async () => [
          { date: '2026-08-26', answerCount: 4 },
          { date: '2026-08-31', answerCount: 2 },
        ],
      }),
      { userId: 'u1', now },
    )

    expect(result).toEqual({
      days: [
        { date: '2026-08-25', weekday: 2, answerCount: 0 },
        { date: '2026-08-26', weekday: 3, answerCount: 4 },
        { date: '2026-08-27', weekday: 4, answerCount: 0 },
        { date: '2026-08-28', weekday: 5, answerCount: 0 },
        { date: '2026-08-29', weekday: 6, answerCount: 0 },
        { date: '2026-08-30', weekday: 7, answerCount: 0 },
        { date: '2026-08-31', weekday: 1, answerCount: 2 },
      ],
    })
  })

  it('filters, sorts, and limits mistake ranking deterministically', async () => {
    const result = await getAnalyticsMistakes(
      createDeps({
        findMistakes: async () => [
          { questionId: 'q-tie-b', answerCount: 2, incorrectAnswerCount: 1 },
          { questionId: 'q-low', answerCount: 1, incorrectAnswerCount: 1 },
          { questionId: 'q-tie-a', answerCount: 2, incorrectAnswerCount: 1 },
          { questionId: 'q-high', answerCount: 4, incorrectAnswerCount: 4 },
        ],
      }),
      { userId: 'u1' },
    )

    expect(result.items).toEqual([
      { questionId: 'q-high', incorrectRate: 100, answerCount: 4, incorrectAnswerCount: 4 },
      { questionId: 'q-tie-a', incorrectRate: 50, answerCount: 2, incorrectAnswerCount: 1 },
      { questionId: 'q-tie-b', incorrectRate: 50, answerCount: 2, incorrectAnswerCount: 1 },
    ])
  })

  it('uses UTC and Monday as the week boundary', () => {
    expect(recentUtcDays(now)[0]).toEqual({ date: '2026-08-25', weekday: 2 })
    expect(utcWeekStart(now)).toBe(Date.parse('2026-08-31T00:00:00.000Z'))
  })
})
