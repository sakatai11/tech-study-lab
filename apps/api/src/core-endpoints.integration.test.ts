import { SELF, applyD1Migrations, env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import initialMigration from '../drizzle/migrations/0000_flowery_quasar.sql?raw'
import srsVersionMigration from '../drizzle/migrations/0001_add_srs_version.sql?raw'

import { createReviewDeps } from './dal/review-repository'
import { FIXED_USER_ID } from './fixed-user'

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

async function seedQuestion(questionId: string, answerIndex: number): Promise<void> {
  await env.DB.prepare('INSERT INTO questions (question_id, answer_index) VALUES (?, ?)')
    .bind(questionId, answerIndex)
    .run()
}

async function seedSrsState(
  questionId: string,
  dueAt: number,
  userId = FIXED_USER_ID,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO srs_states (user_id, question_id, ease, interval_days, due_at, reps, lapses) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(userId, questionId, 2500, 1, dueAt, 1, 0)
    .run()
}

describe('core API endpoints', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, [
      { name: '0000_flowery_quasar.sql', queries: migrationQueries(initialMigration) },
      { name: '0001_add_srs_version.sql', queries: migrationQueries(srsVersionMigration) },
    ])
  })

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM answer_logs'),
      env.DB.prepare('DELETE FROM srs_states'),
      env.DB.prepare('DELETE FROM questions'),
    ])
  })

  it('grades an answer and atomically records its log and next SRS state for the fixed user', async () => {
    await seedQuestion('question-1', 2)

    const response = await SELF.fetch('https://api.test/answers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        questionId: 'question-1',
        selectedIndex: 2,
        responseTimeMs: 800,
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ isCorrect: true, correctIndex: 2 })
    await expect(
      env.DB.prepare(
        'SELECT user_id, question_id, is_correct, response_time_ms FROM answer_logs',
      ).all(),
    ).resolves.toMatchObject({
      results: [
        {
          user_id: FIXED_USER_ID,
          question_id: 'question-1',
          is_correct: 1,
          response_time_ms: 800,
        },
      ],
    })
    await expect(
      env.DB.prepare('SELECT user_id, question_id, interval_days, reps FROM srs_states').all(),
    ).resolves.toMatchObject({
      results: [
        {
          user_id: FIXED_USER_ID,
          question_id: 'question-1',
          interval_days: 1,
          reps: 1,
        },
      ],
    })
  })

  it('maps a missing authoritative question to the public 404 error contract', async () => {
    const response = await SELF.fetch('https://api.test/answers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ questionId: 'missing-question', selectedIndex: 0 }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'QUESTION_NOT_FOUND',
        message: 'Question not found: missing-question',
      },
    })
  })

  it('rejects a client-provided userId before it can affect the fixed user context', async () => {
    const response = await SELF.fetch('https://api.test/answers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        questionId: 'question-1',
        selectedIndex: 2,
        userId: 'untrusted-user',
      }),
    })

    expect(response.status).toBe(400)
    await expect(env.DB.prepare('SELECT * FROM answer_logs').all()).resolves.toMatchObject({
      results: [],
    })
  })

  it('returns due items at the due boundary in order with a maximum of twenty items', async () => {
    const now = Date.now()
    await Promise.all(
      Array.from({ length: 21 }, (_, index) =>
        seedSrsState(`question-${index + 1}`, now - (21 - index) * 1_000),
      ),
    )
    await seedSrsState('not-due', now + 60_000)
    await seedSrsState('other-user', now - 60_000, 'another-user')

    const [queueResponse, countResponse] = await Promise.all([
      SELF.fetch('https://api.test/review/queue'),
      SELF.fetch('https://api.test/dashboard/due-count'),
    ])

    expect(queueResponse.status).toBe(200)
    await expect(queueResponse.json()).resolves.toEqual({
      items: Array.from({ length: 20 }, (_, index) => ({
        questionId: `question-${index + 1}`,
        dueAt: now - (21 - index) * 1_000,
      })),
    })
    expect(countResponse.status).toBe(200)
    await expect(countResponse.json()).resolves.toEqual({ dueCount: 21 })
  })

  it('includes a state due exactly at the supplied time in the queue and count', async () => {
    const now = 1_700_000_000_000
    await seedSrsState('before', now - 1)
    await seedSrsState('at-boundary', now)
    await seedSrsState('after', now + 1)

    const reviewDeps = createReviewDeps(drizzle(env.DB))

    await expect(reviewDeps.findDueQuestions(FIXED_USER_ID, now)).resolves.toEqual([
      { questionId: 'before', dueAt: now - 1 },
      { questionId: 'at-boundary', dueAt: now },
    ])
    await expect(reviewDeps.countDueQuestions(FIXED_USER_ID, now)).resolves.toBe(2)
  })
})
