import { describe, expect, it } from 'vitest'

import { type ActivityDeps, getRecentActivity } from './activity-service'

function createDeps(overrides: Partial<ActivityDeps> = {}): ActivityDeps {
  return {
    findRecentActivity: async () => [],
    ...overrides,
  }
}

describe('activity service', () => {
  it('merges, stably sorts, and limits saved activity events', async () => {
    const result = await getRecentActivity(
      createDeps({
        findRecentActivity: async () => [
          {
            id: 'lesson-view:view-2',
            type: 'lesson_viewed',
            occurredAt: 20,
            lessonId: 'lesson-2',
          },
          {
            id: 'answer:answer-2',
            type: 'answer_recorded',
            occurredAt: 20,
            questionId: 'question-2',
            lessonId: null,
            isCorrect: false,
          },
          {
            id: 'answer:answer-1',
            type: 'answer_recorded',
            occurredAt: 30,
            questionId: 'question-1',
            lessonId: 'lesson-1',
            isCorrect: true,
          },
          ...Array.from({ length: 9 }, (_, index) => ({
            id: `answer:older-${index}`,
            type: 'answer_recorded' as const,
            occurredAt: index,
            questionId: `question-${index + 3}`,
            lessonId: null,
            isCorrect: true,
          })),
        ],
      }),
      { userId: 'u1' },
    )

    expect(result.items).toHaveLength(10)
    expect(result.items[0]?.id).toBe('answer:answer-1')
    expect(result.items[1]?.id).toBe('answer:answer-2')
    expect(result.items[2]?.id).toBe('lesson-view:view-2')
    expect(new Set(result.items.map(({ id }) => id)).size).toBe(result.items.length)
  })

  it('keeps answer events with missing question metadata', async () => {
    const result = await getRecentActivity(
      createDeps({
        findRecentActivity: async () => [
          {
            id: 'answer:answer-1',
            type: 'answer_recorded',
            occurredAt: 1,
            questionId: 'deleted-question',
            lessonId: null,
            isCorrect: false,
          },
        ],
      }),
      { userId: 'u1' },
    )

    expect(result.items).toEqual([
      {
        id: 'answer:answer-1',
        type: 'answer_recorded',
        occurredAt: 1,
        questionId: 'deleted-question',
        lessonId: null,
        isCorrect: false,
      },
    ])
  })
})
