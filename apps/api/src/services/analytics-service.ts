import type {
  AnalyticsSummaryResponse,
  AnalyticsWeeklyResponse,
  MistakesResponse,
} from '@tsl/shared'

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

export type AnalyticsSrsRow = {
  intervalDays: number
  dueAt: number
}

export type AnalyticsLessonViewCount = {
  lessonId: string
  count: number
  estimatedMinutes: number
}

export type AnalyticsSummaryData = {
  totalAnswerCount: number
  correctAnswerCount: number
  responseTimeTotalMs: number
  responseTimeCount: number
  thisWeekResponseTimeTotalMs: number
  lessonViewCounts: AnalyticsLessonViewCount[]
  activityDates: string[]
  srsStates: AnalyticsSrsRow[]
}

export type AnalyticsWeeklyRow = {
  date: string
  answerCount: number
}

export type AnalyticsMistakeRow = {
  questionId: string
  answerCount: number
  incorrectAnswerCount: number
}

export type AnalyticsDeps = {
  findSummaryData(userId: string, now: number): Promise<AnalyticsSummaryData>
  findWeeklyAnswerCounts(
    userId: string,
    startAt: number,
    endAt: number,
  ): Promise<AnalyticsWeeklyRow[]>
  findMistakes(userId: string): Promise<AnalyticsMistakeRow[]>
}

type AnalyticsInput = {
  userId: string
  now: number
}

function utcDayStart(timestamp: number): number {
  const date = new Date(timestamp)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function utcDateKey(timestamp: number): string {
  return new Date(utcDayStart(timestamp)).toISOString().slice(0, 10)
}

export function recentUtcDays(now: number): { date: string; weekday: number }[] {
  const today = utcDayStart(now)

  return Array.from({ length: 7 }, (_, index) => {
    const timestamp = today - (6 - index) * DAY_MS
    const weekday = new Date(timestamp).getUTCDay() || 7
    return { date: utcDateKey(timestamp), weekday }
  })
}

export function utcWeekStart(now: number): number {
  const today = utcDayStart(now)
  const weekday = new Date(today).getUTCDay() || 7
  return today - (weekday - 1) * DAY_MS
}

function currentStreakDays(activityDates: readonly string[], now: number): number {
  const activeDates = new Set(activityDates)
  const today = utcDayStart(now)
  const todayKey = utcDateKey(today)
  const firstDay = activeDates.has(todayKey) ? today : today - DAY_MS

  let streak = 0
  for (let timestamp = firstDay; activeDates.has(utcDateKey(timestamp)); timestamp -= DAY_MS) {
    streak += 1
  }
  return streak
}

export function getAnalyticsSummary(
  deps: AnalyticsDeps,
  input: AnalyticsInput,
): Promise<AnalyticsSummaryResponse> {
  return deps.findSummaryData(input.userId, input.now).then((data) => {
    const correctAnswerRate =
      data.totalAnswerCount === 0
        ? 0
        : Math.round((data.correctAnswerCount / data.totalAnswerCount) * 100)
    const averageResponseTimeMs =
      data.responseTimeCount === 0
        ? 0
        : Math.round(data.responseTimeTotalMs / data.responseTimeCount)
    const retentionDistribution = data.srsStates.reduce(
      (distribution, state) => {
        if (state.dueAt <= input.now) {
          distribution.dueCount += 1
        } else if (state.intervalDays >= 21) {
          distribution.masteredCount += 1
        } else {
          distribution.learningCount += 1
        }
        return distribution
      },
      { masteredCount: 0, learningCount: 0, dueCount: 0 },
    )
    const thisWeekStudyTimeMs =
      data.thisWeekResponseTimeTotalMs +
      data.lessonViewCounts.reduce(
        (total, view) => total + view.count * view.estimatedMinutes * MINUTE_MS,
        0,
      )

    return {
      totalAnswerCount: data.totalAnswerCount,
      correctAnswerRate,
      averageResponseTimeMs,
      masteredQuestionCount: data.srsStates.filter((state) => state.intervalDays >= 21).length,
      currentStreakDays: currentStreakDays(data.activityDates, input.now),
      thisWeekStudyTimeMs,
      retentionDistribution,
    }
  })
}

export async function getAnalyticsWeekly(
  deps: AnalyticsDeps,
  input: AnalyticsInput,
): Promise<AnalyticsWeeklyResponse> {
  const days = recentUtcDays(input.now)
  const startAt = utcDayStart(input.now) - 6 * DAY_MS
  const endAt = utcDayStart(input.now) + DAY_MS
  const rows = await deps.findWeeklyAnswerCounts(input.userId, startAt, endAt)
  const countsByDate = new Map(rows.map((row) => [row.date, row.answerCount]))

  return {
    days: days.map((day) => ({ ...day, answerCount: countsByDate.get(day.date) ?? 0 })),
  }
}

export async function getAnalyticsMistakes(
  deps: AnalyticsDeps,
  input: Pick<AnalyticsInput, 'userId'>,
): Promise<MistakesResponse> {
  const rows = await deps.findMistakes(input.userId)
  const items = rows
    .filter((row) => row.answerCount >= 2)
    .map((row) => ({
      questionId: row.questionId,
      incorrectRate: Math.round((row.incorrectAnswerCount / row.answerCount) * 1000) / 10,
      answerCount: row.answerCount,
      incorrectAnswerCount: row.incorrectAnswerCount,
    }))
    .sort(
      (left, right) =>
        right.incorrectRate - left.incorrectRate ||
        right.answerCount - left.answerCount ||
        left.questionId.localeCompare(right.questionId, 'en'),
    )
    .slice(0, 10)

  return { items }
}
