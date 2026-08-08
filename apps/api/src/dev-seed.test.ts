import { describe, expect, it } from 'vitest'

import { DAY_MS, initialSrs, reviewSrs } from '@tsl/shared'

import { createDevSeedSql, createLocalDevSeedD1ExecuteArgs } from './dev-seed'
import { FIXED_USER_ID } from './fixed-user'

const SEEDED_AT = 1_700_000_000_000
const INCORRECT_ANSWERED_AT = SEEDED_AT - 4 * DAY_MS
const CORRECT_ANSWERED_AT = INCORRECT_ANSWERED_AT + DAY_MS + 1
const EXPECTED_SRS = reviewSrs(
  reviewSrs(initialSrs(), false, INCORRECT_ANSWERED_AT),
  true,
  CORRECT_ANSWERED_AT,
)

describe('createDevSeedSql', () => {
  it('replaces only the fixed user dynamic data with the state after its seeded answer sequence', () => {
    const sql = createDevSeedSql(
      {
        userId: FIXED_USER_ID,
        questions: [
          { questionId: 'security-xss-01-q2', answerIndex: 2 },
          { questionId: 'security-xss-01-q1', answerIndex: 0 },
        ],
      },
      SEEDED_AT,
    )

    expect(sql).toContain("DELETE FROM answer_logs WHERE user_id = 'user-local-001'")
    expect(sql).toContain("DELETE FROM srs_states WHERE user_id = 'user-local-001'")
    expect(sql).not.toContain('DELETE FROM users')
    expect(sql).not.toContain('DELETE FROM questions')
    expect(sql).not.toContain('other-user')
    expect(EXPECTED_SRS).toEqual({
      ease: 2300,
      intervalDays: 1,
      reps: 1,
      lapses: 1,
      dueAt: 1_699_827_200_001,
    })
    expect(EXPECTED_SRS.dueAt).toBeLessThanOrEqual(SEEDED_AT)
    expect(sql).toContain(
      "INSERT INTO srs_states (user_id, question_id, ease, interval_days, due_at, reps, lapses, version) VALUES ('user-local-001', 'security-xss-01-q1', 2300, 1, 1699827200001, 1, 1, 2)",
    )
    expect(sql).toContain(
      "INSERT INTO srs_states (user_id, question_id, ease, interval_days, due_at, reps, lapses, version) VALUES ('user-local-001', 'security-xss-01-q2', 2300, 1, 1699827200001, 1, 1, 2)",
    )
  })

  it('creates deterministic correct and incorrect answer logs with and without response time for one question', () => {
    const sql = createDevSeedSql(
      {
        userId: FIXED_USER_ID,
        questions: [{ questionId: 'security-xss-01-q1', answerIndex: 0 }],
      },
      SEEDED_AT,
    )

    expect(sql).toContain(
      "INSERT INTO answer_logs (id, user_id, question_id, is_correct, answered_at, response_time_ms) VALUES ('user-local-001:dev-seed:security-xss-01-q1:incorrect', 'user-local-001', 'security-xss-01-q1', 0, 1699654400000, NULL)",
    )
    expect(sql).toContain(
      "INSERT INTO answer_logs (id, user_id, question_id, is_correct, answered_at, response_time_ms) VALUES ('user-local-001:dev-seed:security-xss-01-q1:correct', 'user-local-001', 'security-xss-01-q1', 1, 1699740800001, 1200)",
    )
    expect(sql).toContain('ON CONFLICT(id) DO UPDATE SET')
  })

  it('is deterministic for equivalent question sets regardless of input ordering', () => {
    const first = createDevSeedSql(
      {
        userId: FIXED_USER_ID,
        questions: [
          { questionId: 'security-xss-01-q1', answerIndex: 0 },
          { questionId: 'security-xss-01-q2', answerIndex: 2 },
        ],
      },
      SEEDED_AT,
    )
    const second = createDevSeedSql(
      {
        userId: FIXED_USER_ID,
        questions: [
          { questionId: 'security-xss-01-q2', answerIndex: 2 },
          { questionId: 'security-xss-01-q1', answerIndex: 0 },
        ],
      },
      SEEDED_AT,
    )

    expect(second).toBe(first)
  })

  it('rejects an invalid seed time before generating SQL', () => {
    expect(() => createDevSeedSql({ userId: FIXED_USER_ID, questions: [] }, Number.NaN)).toThrow(
      'seededAt must be a nonnegative safe integer',
    )
  })

  it('rejects a payload for a user other than the fixed development user', () => {
    expect(() => createDevSeedSql({ userId: 'other-user', questions: [] }, SEEDED_AT)).toThrow(
      'dev seed is limited to the fixed user',
    )
  })
})

describe('createLocalDevSeedD1ExecuteArgs', () => {
  it('uses fixed local-only arguments and has no remote or forwarded arguments', () => {
    const args = createLocalDevSeedD1ExecuteArgs('/tmp/dev-seed.sql')

    expect(args).toEqual([
      'd1',
      'execute',
      'tech-study-lab',
      '--local',
      '--file',
      '/tmp/dev-seed.sql',
    ])
    expect(args).not.toContain('--remote')
    expect(args).toHaveLength(6)
  })
})
