import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import initialMigration from '../drizzle/migrations/0000_flowery_quasar.sql?raw'
import srsVersionMigration from '../drizzle/migrations/0001_add_srs_version.sql?raw'
import questionMetadataMigration from '../drizzle/migrations/0002_nasty_guardsmen.sql?raw'

import { FIXED_USER_ID } from './fixed-user'
import { createInternalApiApp } from './index'
import type { PlatformRateLimiter } from './persistent-write-rate-limit'

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database
    WEB_ORIGIN: string
  }
}

function migrationQueries(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((query) => query.trim())
    .filter((query) => query.length > 0)
}

const allowingLimiter: PlatformRateLimiter = {
  async limit() {
    return { success: true }
  },
}

async function fetchAnalytics(path: string): Promise<Response> {
  return createInternalApiApp({
    rateLimiters: { answers: allowingLimiter, lessonViews: allowingLimiter },
  }).fetch(new Request(`https://api.internal${path}`), env)
}

describe('analytics API', () => {
  const fixedNow = Date.parse('2026-08-31T12:00:00.000Z')

  beforeAll(async () => {
    await applyD1Migrations(env.DB, [
      { name: '0000_flowery_quasar.sql', queries: migrationQueries(initialMigration) },
      { name: '0001_add_srs_version.sql', queries: migrationQueries(srsVersionMigration) },
      { name: '0002_nasty_guardsmen.sql', queries: migrationQueries(questionMetadataMigration) },
    ])
  })

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM answer_logs'),
      env.DB.prepare('DELETE FROM lesson_views'),
      env.DB.prepare('DELETE FROM srs_states'),
    ])
  })

  it('aggregates only the middleware user and returns the weekly, retention, and mistake contracts', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow)
    const now = fixedNow
    const day = 24 * 60 * 60 * 1000
    try {
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO answer_logs (id, user_id, question_id, is_correct, answered_at, response_time_ms) VALUES (?, ?, ?, ?, ?, ?)',
        ).bind('answer-1', FIXED_USER_ID, 'q-1', 1, now, 800),
        env.DB.prepare(
          'INSERT INTO answer_logs (id, user_id, question_id, is_correct, answered_at, response_time_ms) VALUES (?, ?, ?, ?, ?, ?)',
        ).bind('answer-2', FIXED_USER_ID, 'q-1', 0, now - day, null),
        env.DB.prepare(
          'INSERT INTO answer_logs (id, user_id, question_id, is_correct, answered_at, response_time_ms) VALUES (?, ?, ?, ?, ?, ?)',
        ).bind('answer-other', 'other-user', 'q-other', 0, now, 20),
        env.DB.prepare(
          'INSERT INTO lesson_views (id, user_id, lesson_id, viewed_at) VALUES (?, ?, ?, ?)',
        ).bind('view-1', FIXED_USER_ID, 'security-xss-01', now),
        env.DB.prepare(
          'INSERT INTO srs_states (user_id, question_id, ease, interval_days, due_at, reps, lapses) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).bind(FIXED_USER_ID, 'q-mastered', 2500, 21, now + day, 5, 0),
        env.DB.prepare(
          'INSERT INTO srs_states (user_id, question_id, ease, interval_days, due_at, reps, lapses) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).bind(FIXED_USER_ID, 'q-due', 2500, 1, now, 1, 0),
      ])

      const [summaryResponse, weeklyResponse, mistakesResponse] = await Promise.all([
        fetchAnalytics('/analytics/summary'),
        fetchAnalytics('/analytics/weekly'),
        fetchAnalytics('/analytics/mistakes'),
      ])

      expect(summaryResponse.status).toBe(200)
      await expect(summaryResponse.json()).resolves.toMatchObject({
        totalAnswerCount: 2,
        correctAnswerRate: 50,
        averageResponseTimeMs: 800,
        masteredQuestionCount: 1,
        currentStreakDays: 2,
        thisWeekStudyTimeMs: 1_080_800,
        retentionDistribution: { masteredCount: 1, learningCount: 0, dueCount: 1 },
      })

      expect(weeklyResponse.status).toBe(200)
      const weekly = (await weeklyResponse.json()) as {
        days: { date: string; weekday: number; answerCount: number }[]
      }
      expect(weekly.days).toHaveLength(7)
      expect(weekly.days.reduce((total, entry) => total + entry.answerCount, 0)).toBe(2)
      expect(
        weekly.days.find((entry) => entry.date === new Date(now).toISOString().slice(0, 10)),
      ).toMatchObject({ answerCount: 1 })

      expect(mistakesResponse.status).toBe(200)
      await expect(mistakesResponse.json()).resolves.toEqual({
        items: [{ questionId: 'q-1', incorrectRate: 50, answerCount: 2, incorrectAnswerCount: 1 }],
      })
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('requires the empty query contract', async () => {
    const response = await fetchAnalytics('/analytics/summary?range=week')
    expect(response.status).toBe(400)
  })
})
