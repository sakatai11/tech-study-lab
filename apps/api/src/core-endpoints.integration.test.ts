import { SELF, applyD1Migrations, env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import initialMigration from '../drizzle/migrations/0000_flowery_quasar.sql?raw'
import srsVersionMigration from '../drizzle/migrations/0001_add_srs_version.sql?raw'
import questionMetadataMigration from '../drizzle/migrations/0002_add_question_metadata.sql?raw'

import { createReviewDeps } from './dal/review-repository'
import { FIXED_USER_ID } from './fixed-user'
import { createInternalApiApp, createPublicApiApp } from './index'
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

async function seedQuestion(
  questionId: string,
  answerIndex: number,
  metadata?: {
    domain: string
    topic: string
    lessonId: string
    isActive?: boolean
  },
): Promise<void> {
  if (!metadata) {
    await env.DB.prepare('INSERT INTO questions (question_id, answer_index) VALUES (?, ?)')
      .bind(questionId, answerIndex)
      .run()
    return
  }

  await env.DB.prepare(
    'INSERT INTO questions (question_id, answer_index, domain, topic, lesson_id, is_active) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(
      questionId,
      answerIndex,
      metadata.domain,
      metadata.topic,
      metadata.lessonId,
      metadata.isActive === false ? 0 : 1,
    )
    .run()
}

async function seedSrsState(
  questionId: string,
  dueAt: number,
  userId = FIXED_USER_ID,
  intervalDays = 1,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO srs_states (user_id, question_id, ease, interval_days, due_at, reps, lapses) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(userId, questionId, 2500, intervalDays, dueAt, 1, 0)
    .run()
}

const allowingLimiter: PlatformRateLimiter = {
  async limit() {
    return { success: true }
  },
}

const allowingRateLimiters = {
  answers: allowingLimiter,
  lessonViews: allowingLimiter,
}

async function fetchInternal(path: string, init?: RequestInit): Promise<Response> {
  return await createInternalApiApp({ rateLimiters: allowingRateLimiters }).fetch(
    new Request(`https://api.internal${path}`, init),
    env,
  )
}

describe('core API endpoints', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, [
      { name: '0000_flowery_quasar.sql', queries: migrationQueries(initialMigration) },
      { name: '0001_add_srs_version.sql', queries: migrationQueries(srsVersionMigration) },
      {
        name: '0002_add_question_metadata.sql',
        queries: migrationQueries(questionMetadataMigration),
      },
    ])
  })

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM answer_logs'),
      env.DB.prepare('DELETE FROM srs_states'),
      env.DB.prepare('DELETE FROM questions'),
      env.DB.prepare('DELETE FROM lesson_views'),
    ])
  })

  it('ミドルウェアで確定したユーザーの教材閲覧を記録する', async () => {
    const response = await fetchInternal('/lesson-views', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lessonId: 'security-xss-01' }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ recorded: true })
    await expect(
      env.DB.prepare('SELECT user_id, lesson_id, viewed_at FROM lesson_views').all(),
    ).resolves.toMatchObject({
      results: [
        {
          user_id: FIXED_USER_ID,
          lesson_id: 'security-xss-01',
          viewed_at: expect.any(Number),
        },
      ],
    })
  })

  it('クライアント指定の userId を拒否し教材閲覧を記録しない', async () => {
    const response = await fetchInternal('/lesson-views', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lessonId: 'security-xss-01',
        userId: 'untrusted-user',
      }),
    })

    expect(response.status).toBe(400)
    await expect(env.DB.prepare('SELECT * FROM lesson_views').all()).resolves.toMatchObject({
      results: [],
    })
  })

  it('grades an answer and atomically records its log and next SRS state for the fixed user', async () => {
    await seedQuestion('question-1', 2)

    const response = await fetchInternal('/answers', {
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
    const response = await fetchInternal('/answers', {
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
    const response = await fetchInternal('/answers', {
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

  it.each([
    {
      entrypoint: 'internal',
      endpoint: '/answers',
      body: { questionId: 'question-1', selectedIndex: 0 },
    },
    { entrypoint: 'internal', endpoint: '/lesson-views', body: { lessonId: 'security-xss-01' } },
    {
      entrypoint: 'public',
      endpoint: '/answers',
      body: { questionId: 'question-1', selectedIndex: 0 },
    },
    { entrypoint: 'public', endpoint: '/lesson-views', body: { lessonId: 'security-xss-01' } },
  ])(
    'returns the shared 429 contract before a $entrypoint $endpoint D1 write',
    async ({ entrypoint, endpoint, body }) => {
      const deniedLimiter: PlatformRateLimiter = {
        async limit() {
          return { success: false }
        },
      }
      const rateLimiters = { answers: deniedLimiter, lessonViews: deniedLimiter }
      const request = new Request(`https://api.example.com${endpoint}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(entrypoint === 'public' ? { 'Cf-Access-Jwt-Assertion': 'valid-token' } : {}),
        },
        body: JSON.stringify(body),
      })
      const app =
        entrypoint === 'public'
          ? createPublicApiApp(async () => undefined, { rateLimiters })
          : createInternalApiApp({ rateLimiters })
      const bindings =
        entrypoint === 'public'
          ? {
              ...env,
              ACCESS_AUDIENCE: 'access-audience',
              ACCESS_ISSUER: 'https://team.cloudflareaccess.com',
              WEB_ORIGIN: 'https://web.example.com',
            }
          : env

      const response = await app.fetch(request, bindings)

      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBe('60')
      await expect(response.json()).resolves.toEqual({
        error: { code: 'RATE_LIMITED', message: 'Too Many Requests' },
      })
      await expect(
        env.DB.prepare(
          'SELECT (SELECT COUNT(*) FROM answer_logs) AS answer_logs, (SELECT COUNT(*) FROM lesson_views) AS lesson_views, (SELECT COUNT(*) FROM srs_states) AS srs_states',
        ).first(),
      ).resolves.toEqual({ answer_logs: 0, lesson_views: 0, srs_states: 0 })
    },
  )

  it.each([
    { endpoint: '/answers', body: { questionId: 'question-1', selectedIndex: 0 } },
    { endpoint: '/lesson-views', body: { lessonId: 'security-xss-01' } },
  ])(
    'fails closed without D1 changes when the limiter is unavailable for $endpoint',
    async ({ endpoint, body }) => {
      const unavailableLimiter: PlatformRateLimiter = {
        async limit() {
          throw new Error('limiter unavailable')
        },
      }
      const response = await createInternalApiApp({
        rateLimiters: { answers: unavailableLimiter, lessonViews: unavailableLimiter },
      }).fetch(
        new Request(`https://api.internal${endpoint}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        env,
      )

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({
        error: { code: 'RATE_LIMIT_UNAVAILABLE', message: 'Rate limit unavailable' },
      })
      await expect(
        env.DB.prepare(
          'SELECT (SELECT COUNT(*) FROM answer_logs) AS answer_logs, (SELECT COUNT(*) FROM lesson_views) AS lesson_views, (SELECT COUNT(*) FROM srs_states) AS srs_states',
        ).first(),
      ).resolves.toEqual({ answer_logs: 0, lesson_views: 0, srs_states: 0 })
    },
  )

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
      fetchInternal('/review/queue'),
      fetchInternal('/dashboard/due-count'),
    ])

    expect(queueResponse.status).toBe(200)
    await expect(queueResponse.json()).resolves.toEqual({
      hasMore: true,
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

    await expect(reviewDeps.findDueQuestions(FIXED_USER_ID, now)).resolves.toEqual({
      hasMore: false,
      items: [
        { questionId: 'before', dueAt: now - 1 },
        { questionId: 'at-boundary', dueAt: now },
      ],
    })
    await expect(reviewDeps.countDueQuestions(FIXED_USER_ID, now)).resolves.toBe(2)
  })

  it('returns ordered four-domain summaries with active questions, mastery boundary, and user isolation', async () => {
    await seedQuestion('security-1', 0, {
      domain: 'security',
      topic: 'xss',
      lessonId: 'security-xss-01',
    })
    await seedQuestion('security-2', 0, {
      domain: 'security',
      topic: 'xss',
      lessonId: 'security-xss-01',
    })
    await seedQuestion('security-3', 0, {
      domain: 'security',
      topic: 'csrf',
      lessonId: 'security-csrf-01',
      isActive: false,
    })
    await seedQuestion('backend-1', 0, {
      domain: 'backend',
      topic: 'api',
      lessonId: 'backend-api-01',
    })
    await seedSrsState('security-1', 1_700_000_000_000, FIXED_USER_ID, 20)
    await seedSrsState('security-2', 1_700_000_000_000, FIXED_USER_ID, 21)
    await seedSrsState('security-2', 1_700_000_000_000, 'another-user', 99)
    await seedSrsState('backend-1', 1_700_000_000_000, FIXED_USER_ID, 21)

    const response = await fetchInternal('/domains')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      domains: [
        {
          domain: 'security',
          masteredQuestionCount: 1,
          totalQuestionCount: 2,
          masteryRate: 50,
          topicCount: 1,
          lessonCount: 1,
        },
        {
          domain: 'frontend',
          masteredQuestionCount: 0,
          totalQuestionCount: 0,
          masteryRate: 0,
          topicCount: 0,
          lessonCount: 0,
        },
        {
          domain: 'backend',
          masteredQuestionCount: 1,
          totalQuestionCount: 1,
          masteryRate: 100,
          topicCount: 1,
          lessonCount: 1,
        },
        {
          domain: 'architecture',
          masteredQuestionCount: 0,
          totalQuestionCount: 0,
          masteryRate: 0,
          topicCount: 0,
          lessonCount: 0,
        },
      ],
    })
  })

  it('keeps the domains route behind Access and maps repository failures to 500', async () => {
    const publicResponse = await createPublicApiApp().fetch(
      new Request('https://api.example.com/domains'),
      {
        ...env,
        ACCESS_AUDIENCE: 'access-audience',
        ACCESS_ISSUER: 'https://team.cloudflareaccess.com',
        WEB_ORIGIN: 'https://web.example.com',
      },
    )
    expect(publicResponse.status).toBe(401)

    const failingDb = {
      prepare() {
        throw new Error('D1 query failed')
      },
    } as unknown as D1Database
    const internalResponse = await createInternalApiApp().fetch(
      new Request('https://api.internal/domains'),
      { ...env, DB: failingDb },
    )
    expect(internalResponse.status).toBe(500)
    await expect(internalResponse.json()).resolves.toEqual({
      error: { code: 'INTERNAL', message: 'Internal Server Error' },
    })
  })

  it('allows an Access-verified public write and rejects unauthorized writes before D1 changes', async () => {
    const app = createPublicApiApp(async () => undefined, { rateLimiters: allowingRateLimiters })
    const bindings = {
      ...env,
      ACCESS_AUDIENCE: 'access-audience',
      ACCESS_ISSUER: 'https://team.cloudflareaccess.com',
      WEB_ORIGIN: 'https://web.example.com',
    }
    const lessonViewRequest = (headers: Record<string, string> = {}) =>
      new Request('https://api.example.com/lesson-views', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ lessonId: 'security-xss-01' }),
      })

    await seedQuestion('protected-question', 0)
    const [unauthorizedLessonView, unauthorizedAnswer] = await Promise.all([
      app.fetch(lessonViewRequest(), bindings),
      app.fetch(
        new Request('https://api.example.com/answers', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ questionId: 'protected-question', selectedIndex: 0 }),
        }),
        bindings,
      ),
    ])

    expect(unauthorizedLessonView.status).toBe(401)
    expect(unauthorizedAnswer.status).toBe(401)
    await expect(
      env.DB.prepare(
        'SELECT (SELECT COUNT(*) FROM answer_logs) AS answer_logs, (SELECT COUNT(*) FROM lesson_views) AS lesson_views, (SELECT COUNT(*) FROM srs_states) AS srs_states',
      ).first(),
    ).resolves.toEqual({ answer_logs: 0, lesson_views: 0, srs_states: 0 })

    const authorized = await app.fetch(
      lessonViewRequest({ 'Cf-Access-Jwt-Assertion': 'valid-token' }),
      bindings,
    )
    expect(authorized.status).toBe(201)
    await expect(env.DB.prepare('SELECT user_id FROM lesson_views').all()).resolves.toMatchObject({
      results: [{ user_id: FIXED_USER_ID }],
    })
  })

  it('rejects an unauthorized non-loopback write through the default public Worker before D1 changes', async () => {
    const response = await SELF.fetch('https://api.test/answers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ questionId: 'protected-question', selectedIndex: 0 }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
    })
    await expect(
      env.DB.prepare(
        'SELECT (SELECT COUNT(*) FROM answer_logs) AS answer_logs, (SELECT COUNT(*) FROM lesson_views) AS lesson_views, (SELECT COUNT(*) FROM srs_states) AS srs_states',
      ).first(),
    ).resolves.toEqual({ answer_logs: 0, lesson_views: 0, srs_states: 0 })
  })
})
