import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { DAY_MS, initialSrs, reviewSrs } from '@tsl/shared'

import initialMigration from '../drizzle/migrations/0000_flowery_quasar.sql?raw'
import srsVersionMigration from '../drizzle/migrations/0001_add_srs_version.sql?raw'

import { createDevSeedSql } from './dev-seed'
import { FIXED_USER_ID } from './fixed-user'

const SEEDED_AT = 1_700_000_000_000
const INCORRECT_ANSWERED_AT = SEEDED_AT - 4 * DAY_MS
const CORRECT_ANSWERED_AT = INCORRECT_ANSWERED_AT + DAY_MS + 1
const EXPECTED_SRS = reviewSrs(
  reviewSrs(initialSrs(), false, INCORRECT_ANSWERED_AT),
  true,
  CORRECT_ANSWERED_AT,
)

function migrationQueries(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((query) => query.trim())
    .filter((query) => query.length > 0)
}

describe('local dynamic D1 development seed', () => {
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
      env.DB.prepare('DELETE FROM users'),
    ])
  })

  it('can be applied twice without growing fixed-user data or deleting another user', async () => {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO answer_logs (id, user_id, question_id, is_correct, answered_at) VALUES (?, ?, ?, ?, ?)',
      ).bind('other-log', 'other-user', 'other-question', 1, 1),
      env.DB.prepare(
        'INSERT INTO srs_states (user_id, question_id, ease, interval_days, due_at, reps, lapses, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind('other-user', 'other-question', 2500, 1, 1, 1, 0, 0),
    ])

    const sql = createDevSeedSql(
      {
        userId: FIXED_USER_ID,
        questions: [{ questionId: 'security-xss-01-q1', answerIndex: 0 }],
      },
      SEEDED_AT,
    )

    await env.DB.exec(sql)
    await env.DB.exec(sql)

    await expect(
      env.DB.prepare(
        'SELECT question_id, is_correct, answered_at, response_time_ms FROM answer_logs WHERE user_id = ? ORDER BY id',
      )
        .bind(FIXED_USER_ID)
        .all(),
    ).resolves.toEqual({
      results: [
        {
          question_id: 'security-xss-01-q1',
          is_correct: 1,
          answered_at: CORRECT_ANSWERED_AT,
          response_time_ms: 1200,
        },
        {
          question_id: 'security-xss-01-q1',
          is_correct: 0,
          answered_at: INCORRECT_ANSWERED_AT,
          response_time_ms: null,
        },
      ],
      success: true,
      meta: expect.any(Object),
    })
    await expect(
      env.DB.prepare(
        'SELECT question_id, ease, interval_days, due_at, reps, lapses, version FROM srs_states WHERE user_id = ?',
      )
        .bind(FIXED_USER_ID)
        .all(),
    ).resolves.toMatchObject({
      results: [
        {
          question_id: 'security-xss-01-q1',
          ease: EXPECTED_SRS.ease,
          interval_days: EXPECTED_SRS.intervalDays,
          due_at: EXPECTED_SRS.dueAt,
          reps: EXPECTED_SRS.reps,
          lapses: EXPECTED_SRS.lapses,
          version: 2,
        },
      ],
    })
    const seededStateCount = await env.DB.prepare(
      'SELECT COUNT(*) AS state_count FROM srs_states WHERE user_id = ?',
    )
      .bind(FIXED_USER_ID)
      .first<{ state_count: number }>()
    expect(seededStateCount?.state_count).toBeGreaterThan(0)
    const futureDueStateCount = await env.DB.prepare(
      'SELECT COUNT(*) AS future_due_count FROM srs_states WHERE user_id = ? AND due_at > ?',
    )
      .bind(FIXED_USER_ID, SEEDED_AT)
      .first<{ future_due_count: number }>()
    expect(futureDueStateCount?.future_due_count).toBe(0)
    await expect(
      env.DB.prepare('SELECT id, user_id FROM answer_logs WHERE user_id = ?')
        .bind('other-user')
        .all(),
    ).resolves.toMatchObject({ results: [{ id: 'other-log', user_id: 'other-user' }] })
    await expect(
      env.DB.prepare('SELECT user_id, question_id FROM srs_states WHERE user_id = ?')
        .bind('other-user')
        .all(),
    ).resolves.toMatchObject({
      results: [{ user_id: 'other-user', question_id: 'other-question' }],
    })
  })
})
