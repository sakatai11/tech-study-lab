import { describe, expect, it } from 'vitest'
import {
  analyticsSummaryResponseSchema,
  analyticsWeeklyResponseSchema,
  answerRequestSchema,
  answerResponseSchema,
  domainSummarySchema,
  domainsResponseSchema,
  dueCountResponseSchema,
  lessonViewRequestSchema,
  lessonViewResponseSchema,
  mistakesResponseSchema,
  rateLimitUnavailableErrorResponseSchema,
  rateLimitedErrorResponseSchema,
  retentionDistributionSchema,
  reviewQueueResponseSchema,
} from './api'

describe('answerRequestSchema', () => {
  it('selectedIndex 0 と responseTimeMs なしを受け付ける', () => {
    expect(
      answerRequestSchema.safeParse({
        questionId: 'q-1',
        selectedIndex: 0,
      }).success,
    ).toBe(true)
  })

  it('selectedIndex 5 と responseTimeMs ありを受け付ける', () => {
    expect(
      answerRequestSchema.safeParse({
        questionId: 'q-1',
        selectedIndex: 5,
        responseTimeMs: 1200,
      }).success,
    ).toBe(true)
  })

  it('selectedIndex が -1 だと失敗する', () => {
    expect(
      answerRequestSchema.safeParse({
        questionId: 'q-1',
        selectedIndex: -1,
      }).success,
    ).toBe(false)
  })

  it('selectedIndex が 6 だと失敗する', () => {
    expect(
      answerRequestSchema.safeParse({
        questionId: 'q-1',
        selectedIndex: 6,
      }).success,
    ).toBe(false)
  })

  it('selectedIndex が小数だと失敗する', () => {
    expect(
      answerRequestSchema.safeParse({
        questionId: 'q-1',
        selectedIndex: 1.5,
      }).success,
    ).toBe(false)
  })

  it('questionId が空文字だと失敗する', () => {
    expect(
      answerRequestSchema.safeParse({
        questionId: '',
        selectedIndex: 1,
      }).success,
    ).toBe(false)
  })

  it('responseTimeMs が負数だと失敗する', () => {
    expect(
      answerRequestSchema.safeParse({
        questionId: 'q-1',
        selectedIndex: 1,
        responseTimeMs: -1,
      }).success,
    ).toBe(false)
  })

  it('クライアント送信の userId を受け付けない', () => {
    expect(
      answerRequestSchema.safeParse({
        questionId: 'q-1',
        selectedIndex: 1,
        userId: 'untrusted-user',
      }).success,
    ).toBe(false)
  })
})

describe('answerResponseSchema', () => {
  it('有効なレスポンスを受け付ける', () => {
    expect(
      answerResponseSchema.safeParse({
        isCorrect: true,
        correctIndex: 2,
      }).success,
    ).toBe(true)
  })

  it('correctIndex が負数だと失敗する', () => {
    expect(
      answerResponseSchema.safeParse({
        isCorrect: false,
        correctIndex: -1,
      }).success,
    ).toBe(false)
  })

  it('correctIndex が小数だと失敗する', () => {
    expect(
      answerResponseSchema.safeParse({
        isCorrect: false,
        correctIndex: 1.5,
      }).success,
    ).toBe(false)
  })

  it('correctIndex が6以上だと失敗する', () => {
    expect(
      answerResponseSchema.safeParse({
        isCorrect: false,
        correctIndex: 6,
      }).success,
    ).toBe(false)
  })
})

describe('lessonViewRequestSchema', () => {
  it('lessonId を受け付ける', () => {
    expect(lessonViewRequestSchema.safeParse({ lessonId: 'security-xss-01' }).success).toBe(true)
  })

  it('空の lessonId を拒否する', () => {
    expect(lessonViewRequestSchema.safeParse({ lessonId: '' }).success).toBe(false)
  })

  it('クライアント送信の userId を拒否する', () => {
    expect(
      lessonViewRequestSchema.safeParse({
        lessonId: 'security-xss-01',
        userId: 'untrusted-user',
      }).success,
    ).toBe(false)
  })
})

describe('lessonViewResponseSchema', () => {
  it('recorded true を受け付ける', () => {
    expect(lessonViewResponseSchema.safeParse({ recorded: true }).success).toBe(true)
  })

  it('recorded false を拒否する', () => {
    expect(lessonViewResponseSchema.safeParse({ recorded: false }).success).toBe(false)
  })
})

describe('persistent write rate-limit error response schemas', () => {
  it('accepts the reusable 429 error contract', () => {
    expect(
      rateLimitedErrorResponseSchema.safeParse({
        error: { code: 'RATE_LIMITED', message: 'Too Many Requests' },
      }).success,
    ).toBe(true)
  })

  it('rejects a non-contract 429 error code', () => {
    expect(
      rateLimitedErrorResponseSchema.safeParse({
        error: { code: 'INTERNAL', message: 'Too Many Requests' },
      }).success,
    ).toBe(false)
  })

  it('accepts the reusable limiter-unavailable 503 error contract', () => {
    expect(
      rateLimitUnavailableErrorResponseSchema.safeParse({
        error: { code: 'RATE_LIMIT_UNAVAILABLE', message: 'Rate limit unavailable' },
      }).success,
    ).toBe(true)
  })
})

describe('reviewQueueResponseSchema', () => {
  it('hasMore がないと失敗する', () => {
    expect(
      reviewQueueResponseSchema.safeParse({
        items: [],
      }).success,
    ).toBe(false)
  })

  it('items が空配列でも受け付ける', () => {
    expect(
      reviewQueueResponseSchema.safeParse({
        hasMore: false,
        items: [],
      }).success,
    ).toBe(true)
  })

  it('複数 items を受け付ける', () => {
    expect(
      reviewQueueResponseSchema.safeParse({
        hasMore: false,
        items: [
          { questionId: 'q-1', dueAt: 1_700_000_000_000 },
          { questionId: 'q-2', dueAt: 1_700_000_100_000 },
        ],
      }).success,
    ).toBe(true)
  })

  it('items が21件だと失敗する', () => {
    expect(
      reviewQueueResponseSchema.safeParse({
        hasMore: false,
        items: Array.from({ length: 21 }, (_, i) => ({
          questionId: `q-${i}`,
          dueAt: 1_700_000_000_000 + i,
        })),
      }).success,
    ).toBe(false)
  })

  it('dueAt が小数だと失敗する', () => {
    expect(
      reviewQueueResponseSchema.safeParse({
        hasMore: false,
        items: [{ questionId: 'q-1', dueAt: 1.5 }],
      }).success,
    ).toBe(false)
  })

  it('dueAt が負数だと失敗する', () => {
    expect(
      reviewQueueResponseSchema.safeParse({
        hasMore: false,
        items: [{ questionId: 'q-1', dueAt: -1 }],
      }).success,
    ).toBe(false)
  })

  it('questionId が空文字だと失敗する', () => {
    expect(
      reviewQueueResponseSchema.safeParse({
        hasMore: false,
        items: [{ questionId: '', dueAt: 1_700_000_000_000 }],
      }).success,
    ).toBe(false)
  })
})

describe('dueCountResponseSchema', () => {
  it('dueCount 0 を受け付ける', () => {
    expect(
      dueCountResponseSchema.safeParse({
        dueCount: 0,
      }).success,
    ).toBe(true)
  })

  it('dueCount が負数だと失敗する', () => {
    expect(
      dueCountResponseSchema.safeParse({
        dueCount: -1,
      }).success,
    ).toBe(false)
  })
})

describe('domainSummarySchema', () => {
  it('accepts a bounded domain summary', () => {
    expect(
      domainSummarySchema.safeParse({
        domain: 'security',
        masteredQuestionCount: 1,
        totalQuestionCount: 2,
        masteryRate: 50,
        topicCount: 1,
        lessonCount: 1,
      }).success,
    ).toBe(true)
  })

  it('rejects non-integer counts and out-of-range mastery rates independently', () => {
    expect(
      domainSummarySchema.safeParse({
        domain: 'security',
        masteredQuestionCount: 1.5,
        totalQuestionCount: 2,
        masteryRate: 50,
        topicCount: 1,
        lessonCount: 1,
      }).success,
    ).toBe(false)

    expect(
      domainSummarySchema.safeParse({
        domain: 'security',
        masteredQuestionCount: 1,
        totalQuestionCount: 2,
        masteryRate: 101,
        topicCount: 1,
        lessonCount: 1,
      }).success,
    ).toBe(false)
  })
})

describe('analytics response schemas', () => {
  it('accepts the summary contract including retention distribution', () => {
    expect(
      analyticsSummaryResponseSchema.safeParse({
        totalAnswerCount: 3,
        correctAnswerRate: 67,
        averageResponseTimeMs: 800,
        masteredQuestionCount: 1,
        currentStreakDays: 2,
        thisWeekStudyTimeMs: 120_000,
        retentionDistribution: { masteredCount: 1, learningCount: 1, dueCount: 1 },
      }).success,
    ).toBe(true)
  })

  it('rejects out-of-range summary values and non-exclusive-shaped counts', () => {
    expect(
      analyticsSummaryResponseSchema.safeParse({
        totalAnswerCount: 1,
        correctAnswerRate: 101,
        averageResponseTimeMs: 0,
        masteredQuestionCount: 0,
        currentStreakDays: 0,
        thisWeekStudyTimeMs: 0,
        retentionDistribution: { masteredCount: 0, learningCount: 0, dueCount: -1 },
      }).success,
    ).toBe(false)
  })

  it('requires exactly seven dated weekly entries', () => {
    expect(
      analyticsWeeklyResponseSchema.safeParse({
        days: Array.from({ length: 7 }, (_, index) => ({
          date: `2026-08-${String(index + 1).padStart(2, '0')}`,
          weekday: ((index + 6) % 7) + 1,
          answerCount: index,
        })),
      }).success,
    ).toBe(true)
    expect(analyticsWeeklyResponseSchema.safeParse({ days: [] }).success).toBe(false)
  })

  it('accepts and bounds mistake items', () => {
    expect(
      mistakesResponseSchema.safeParse({
        items: [
          { questionId: 'q-1', incorrectRate: 66.7, answerCount: 3, incorrectAnswerCount: 2 },
        ],
      }).success,
    ).toBe(true)
    expect(
      mistakesResponseSchema.safeParse({
        items: [{ questionId: 'q-1', incorrectRate: 101, answerCount: 3, incorrectAnswerCount: 2 }],
      }).success,
    ).toBe(false)
  })

  it('keeps retention distribution as a shared standalone contract', () => {
    expect(
      retentionDistributionSchema.safeParse({ masteredCount: 0, learningCount: 0, dueCount: 0 })
        .success,
    ).toBe(true)
  })
})

describe('domainsResponseSchema', () => {
  it('requires exactly four domain summaries', () => {
    const summaryFor = (domain: 'security' | 'frontend' | 'backend' | 'architecture') => ({
      domain,
      masteredQuestionCount: 0,
      totalQuestionCount: 0,
      masteryRate: 0,
      topicCount: 0,
      lessonCount: 0,
    })
    const summaries = (['security', 'frontend', 'backend', 'architecture'] as const).map(summaryFor)

    expect(domainsResponseSchema.safeParse({ domains: summaries }).success).toBe(true)
    expect(domainsResponseSchema.safeParse({ domains: [summaryFor('security')] }).success).toBe(
      false,
    )
  })

  it('rejects duplicate domains even when four summaries are present', () => {
    const duplicate = {
      domain: 'security' as const,
      masteredQuestionCount: 0,
      totalQuestionCount: 0,
      masteryRate: 0,
      topicCount: 0,
      lessonCount: 0,
    }

    expect(
      domainsResponseSchema.safeParse({ domains: [duplicate, duplicate, duplicate, duplicate] })
        .success,
    ).toBe(false)
  })
})
