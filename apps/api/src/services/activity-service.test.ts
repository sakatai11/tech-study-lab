import { describe, expect, it } from 'vitest'

import { type ActivityDeps, getRecentActivity } from './activity-service'

function createDeps(overrides: Partial<ActivityDeps> = {}): ActivityDeps {
  return {
    findRecentActivity: async () => [],
    ...overrides,
  }
}

describe('activity service', () => {
  it('merges activity sources, sorts ties by ID, and limits to ten', async () => {
    const items = Array.from({ length: 6 }, (_, index) => ({
      id: `view-${index}`,
      type: 'lesson_viewed' as const,
      occurredAt: 1_700_000_000_000 - index,
      lessonId: `lesson-${index}`,
    }))
    const answers = Array.from({ length: 6 }, (_, index) => ({
      id: `answer-${index}`,
      type: 'answer_recorded' as const,
      occurredAt: 1_700_000_000_000 - index,
      questionId: `question-${index}`,
      lessonId: index === 5 ? null : `lesson-${index}`,
      isCorrect: index % 2 === 0,
    }))

    const result = await getRecentActivity(
      createDeps({ findRecentActivity: async () => [...items, ...answers] }),
      { userId: 'u1' },
    )

    expect(result.items).toHaveLength(10)
    expect(result.items.slice(0, 2).map((item) => item.id)).toEqual(['answer-0', 'view-0'])
    expect(result.items.at(-1)?.id).toBe('view-4')
  })

  it('returns an empty activity response for a user without saved facts', async () => {
    await expect(getRecentActivity(createDeps(), { userId: 'u1' })).resolves.toEqual({ items: [] })
  })

  it('passes the fixed limit and user ID to the dependency', async () => {
    let received: { userId: string; limit: number } | undefined
    await getRecentActivity(
      createDeps({
        findRecentActivity: async (userId, limit) => {
          received = { userId, limit }
          return []
        },
      }),
      { userId: 'u1' },
    )
    expect(received).toEqual({ userId: 'u1', limit: 10 })
  })
})
