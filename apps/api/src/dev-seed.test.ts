import { describe, expect, it } from 'vitest'

import { createDevSeedSql, createLocalDevSeedD1ExecuteArgs } from './dev-seed'
import { FIXED_USER_ID } from './fixed-user'

const SEEDED_AT = 1_700_000_000_000

describe('createDevSeedSql', () => {
  it('replaces only the fixed user dynamic data and creates a state due one day in the past', () => {
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
    expect(sql).toContain(
      "INSERT INTO srs_states (user_id, question_id, ease, interval_days, due_at, reps, lapses, version) VALUES ('user-local-001', 'security-xss-01-q1', 2500, 0, 1699913600000, 0, 0, 0)",
    )
    expect(sql).toContain(
      "INSERT INTO srs_states (user_id, question_id, ease, interval_days, due_at, reps, lapses, version) VALUES ('user-local-001', 'security-xss-01-q2', 2500, 0, 1699913600000, 0, 0, 0)",
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
      "INSERT INTO answer_logs (id, user_id, question_id, is_correct, answered_at, response_time_ms) VALUES ('user-local-001:dev-seed:security-xss-01-q1:incorrect', 'user-local-001', 'security-xss-01-q1', 0, 1699913599998, NULL)",
    )
    expect(sql).toContain(
      "INSERT INTO answer_logs (id, user_id, question_id, is_correct, answered_at, response_time_ms) VALUES ('user-local-001:dev-seed:security-xss-01-q1:correct', 'user-local-001', 'security-xss-01-q1', 1, 1699913599999, 1200)",
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
