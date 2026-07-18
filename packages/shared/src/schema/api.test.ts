import { describe, expect, it } from 'vitest'
import {
  answerRequestSchema,
  answerResponseSchema,
  dueCountResponseSchema,
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

describe('reviewQueueResponseSchema', () => {
  it('items が空配列でも受け付ける', () => {
    expect(
      reviewQueueResponseSchema.safeParse({
        items: [],
      }).success,
    ).toBe(true)
  })

  it('複数 items を受け付ける', () => {
    expect(
      reviewQueueResponseSchema.safeParse({
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
        items: [{ questionId: 'q-1', dueAt: 1.5 }],
      }).success,
    ).toBe(false)
  })

  it('dueAt が負数だと失敗する', () => {
    expect(
      reviewQueueResponseSchema.safeParse({
        items: [{ questionId: 'q-1', dueAt: -1 }],
      }).success,
    ).toBe(false)
  })

  it('questionId が空文字だと失敗する', () => {
    expect(
      reviewQueueResponseSchema.safeParse({
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
