import { and, asc, count, eq, gte, lt, lte, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'

import { db as schema } from '@tsl/shared'

import type {
  AnalyticsDeps,
  AnalyticsLessonViewCount,
  AnalyticsMistakeRow,
  AnalyticsSummaryData,
  AnalyticsWeeklyRow,
} from '../services/analytics-service'

export type AnalyticsRepositoryOptions = {
  /**
   * lesson_views intentionally stores only the lesson ID. The catalogue is
   * supplied by the deployment that bundles content, keeping D1 migrations
   * out of this read-only analytics slice.
   */
  estimatedMinutesByLesson?: Readonly<Record<string, number>>
}

const utcDayExpression = (column: unknown) =>
  sql<string>`strftime('%Y-%m-%d', ${column} / 1000, 'unixepoch')`

function utcWeekStart(timestamp: number): number {
  const date = new Date(timestamp)
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const weekday = new Date(today).getUTCDay() || 7
  return today - (weekday - 1) * 24 * 60 * 60 * 1000
}

function toNumber(value: number | null | undefined): number {
  return Number(value ?? 0)
}

export function createAnalyticsDeps(
  db: DrizzleD1Database,
  options: AnalyticsRepositoryOptions = {},
): AnalyticsDeps {
  const estimatedMinutesByLesson = options.estimatedMinutesByLesson ?? {}

  return {
    async findSummaryData(userId, now): Promise<AnalyticsSummaryData> {
      const weekStart = utcWeekStart(now)
      const currentTime = new Date(now)
      const [answerStats, weekAnswerStats, srsStates, lessonViewRows, answerDates, viewDates] =
        await Promise.all([
          db
            .select({
              totalAnswerCount: count(),
              correctAnswerCount: sql<number>`coalesce(sum(case when ${schema.answerLogs.isCorrect} = 1 then 1 else 0 end), 0)`,
              responseTimeTotalMs: sql<number>`coalesce(sum(coalesce(${schema.answerLogs.responseTimeMs}, 0)), 0)`,
              responseTimeCount: sql<number>`count(${schema.answerLogs.responseTimeMs})`,
            })
            .from(schema.answerLogs)
            .where(eq(schema.answerLogs.userId, userId)),
          db
            .select({
              responseTimeTotalMs: sql<number>`coalesce(sum(coalesce(${schema.answerLogs.responseTimeMs}, 0)), 0)`,
            })
            .from(schema.answerLogs)
            .where(
              and(
                eq(schema.answerLogs.userId, userId),
                gte(schema.answerLogs.answeredAt, new Date(weekStart)),
                lte(schema.answerLogs.answeredAt, currentTime),
              ),
            ),
          db
            .select({
              intervalDays: schema.srsStates.intervalDays,
              dueAt: schema.srsStates.dueAt,
            })
            .from(schema.srsStates)
            .where(eq(schema.srsStates.userId, userId)),
          db
            .select({
              lessonId: schema.lessonViews.lessonId,
              count: count(),
            })
            .from(schema.lessonViews)
            .where(
              and(
                eq(schema.lessonViews.userId, userId),
                gte(schema.lessonViews.viewedAt, new Date(weekStart)),
                lte(schema.lessonViews.viewedAt, currentTime),
              ),
            )
            .groupBy(schema.lessonViews.lessonId),
          db
            .select({ date: utcDayExpression(schema.answerLogs.answeredAt) })
            .from(schema.answerLogs)
            .where(eq(schema.answerLogs.userId, userId))
            .groupBy(utcDayExpression(schema.answerLogs.answeredAt)),
          db
            .select({ date: utcDayExpression(schema.lessonViews.viewedAt) })
            .from(schema.lessonViews)
            .where(eq(schema.lessonViews.userId, userId))
            .groupBy(utcDayExpression(schema.lessonViews.viewedAt)),
        ])

      const lessonViewCounts: AnalyticsLessonViewCount[] = lessonViewRows.map((row) => ({
        lessonId: row.lessonId,
        count: toNumber(row.count),
        estimatedMinutes: estimatedMinutesByLesson[row.lessonId] ?? 0,
      }))
      const activityDates = [...new Set([...answerDates, ...viewDates].map((row) => row.date))]
      const [summary] = answerStats
      const [weekSummary] = weekAnswerStats

      return {
        totalAnswerCount: toNumber(summary?.totalAnswerCount),
        correctAnswerCount: toNumber(summary?.correctAnswerCount),
        responseTimeTotalMs: toNumber(summary?.responseTimeTotalMs),
        responseTimeCount: toNumber(summary?.responseTimeCount),
        thisWeekResponseTimeTotalMs: toNumber(weekSummary?.responseTimeTotalMs),
        lessonViewCounts,
        activityDates,
        srsStates: srsStates.map((state) => ({
          intervalDays: state.intervalDays,
          dueAt: state.dueAt.getTime(),
        })),
      }
    },

    async findWeeklyAnswerCounts(userId, startAt, endAt): Promise<AnalyticsWeeklyRow[]> {
      const date = utcDayExpression(schema.answerLogs.answeredAt)
      const rows = await db
        .select({ date, answerCount: count() })
        .from(schema.answerLogs)
        .where(
          and(
            eq(schema.answerLogs.userId, userId),
            gte(schema.answerLogs.answeredAt, new Date(startAt)),
            lt(schema.answerLogs.answeredAt, new Date(endAt)),
          ),
        )
        .groupBy(date)
        .orderBy(asc(date))

      return rows.map((row) => ({ date: row.date, answerCount: toNumber(row.answerCount) }))
    },

    async findMistakes(userId): Promise<AnalyticsMistakeRow[]> {
      const incorrectAnswerCount = sql<number>`sum(case when ${schema.answerLogs.isCorrect} = 0 then 1 else 0 end)`
      const rows = await db
        .select({
          questionId: schema.answerLogs.questionId,
          answerCount: count(),
          incorrectAnswerCount,
        })
        .from(schema.answerLogs)
        .where(eq(schema.answerLogs.userId, userId))
        .groupBy(schema.answerLogs.questionId)

      return rows.map((row) => ({
        questionId: row.questionId,
        answerCount: toNumber(row.answerCount),
        incorrectAnswerCount: toNumber(row.incorrectAnswerCount),
      }))
    },
  }
}
