import { describe, expect, it } from 'vitest'

import {
  type AnalyticsDeps,
  getAnalyticsHeatmap,
  getAnalyticsMistakes,
  getAnalyticsSummary,
  getAnalyticsWeekly,
  recentHeatmapDays,
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
    findHeatmapAnswerCounts: async () => [],
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

  it('passes the service-calculated UTC week start to the summary dependency', async () => {
    let received: { now: number; weekStartAt: number } | undefined
    await getAnalyticsSummary(
      createDeps({
        findSummaryData: async (_userId, receivedNow, weekStartAt) => {
          received = { now: receivedNow, weekStartAt }
          return {
            totalAnswerCount: 0,
            correctAnswerCount: 0,
            responseTimeTotalMs: 0,
            responseTimeCount: 0,
            thisWeekResponseTimeTotalMs: 0,
            lessonViewCounts: [],
            activityDates: [],
            srsStates: [],
          }
        },
      }),
      { userId: 'u1', now },
    )

    expect(received).toEqual({
      now,
      weekStartAt: Date.parse('2026-08-31T00:00:00.000Z'),
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

  it('returns 182 UTC heatmap days in chronological order and fills zeroes', async () => {
    let received: { startAt: number; endAt: number } | undefined
    const result = await getAnalyticsHeatmap(
      createDeps({
        findHeatmapAnswerCounts: async (_userId, startAt, endAt) => {
          received = { startAt, endAt }
          return [
            { date: '2026-03-04', answerCount: 2 },
            { date: '2026-08-31', answerCount: 5 },
          ]
        },
      }),
      { userId: 'u1', now: Date.parse('2026-09-01T12:00:00.000Z') },
    )

    expect(result.days).toHaveLength(182)
    expect(result.days[0]).toEqual({ date: '2026-03-04', answerCount: 2 })
    expect(result.days.at(-1)).toEqual({ date: '2026-09-01', answerCount: 0 })
    expect(result.days.find((day) => day.date === '2026-08-31')).toEqual({
      date: '2026-08-31',
      answerCount: 5,
    })
    expect(received).toEqual({
      startAt: Date.parse('2026-03-04T00:00:00.000Z'),
      endAt: Date.parse('2026-09-02T00:00:00.000Z'),
    })
  })

  it('ranks unrounded error rates before selecting the top ten', async () => {
    const result = await getAnalyticsMistakes(
      createDeps({
        findMistakes: async () => [
          { questionId: 'q-lower', answerCount: 1000, incorrectAnswerCount: 714 },
          { questionId: 'q-higher', answerCount: 7, incorrectAnswerCount: 5 },
          ...Array.from({ length: 9 }, (_, index) => ({
            questionId: `q-perfect-${index}`,
            answerCount: 2,
            incorrectAnswerCount: 2,
          })),
        ],
      }),
      { userId: 'u1' },
    )
    expect(result.items).toHaveLength(10)
    expect(result.items[9]).toEqual({
      questionId: 'q-higher',
      answerCount: 7,
      incorrectAnswerCount: 5,
      incorrectRate: 71.4,
    })
  })

  it('uses UTC and Monday as the week boundary', () => {
    expect(recentUtcDays(now)[0]).toEqual({ date: '2026-08-25', weekday: 2 })
    expect(utcWeekStart(now)).toBe(Date.parse('2026-08-31T00:00:00.000Z'))
  })

  it('uses the UTC date at a day boundary for heatmap generation', () => {
    const days = recentHeatmapDays(Date.parse('2026-09-01T00:00:00.000Z'))
    expect(days[0]).toEqual({ date: '2026-03-04' })
    expect(days.at(-1)).toEqual({ date: '2026-09-01' })
  })
})
