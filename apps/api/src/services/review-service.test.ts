import { describe, expect, it } from 'vitest'

import { type ReviewDeps, getDueCount, getReviewQueue } from './review-service'

function createDeps(): { deps: ReviewDeps; calls: Array<[string, number]> } {
  const calls: Array<[string, number]> = []
  return {
    deps: {
      findDueQuestions: async (userId, now) => {
        calls.push([userId, now])
        return [
          { questionId: 'older', dueAt: 1 },
          { questionId: 'now', dueAt: 2 },
        ]
      },
      countDueQuestions: async (userId, now) => {
        calls.push([userId, now])
        return 2
      },
    },
    calls,
  }
}

describe('review service', () => {
  it('returns the repository queue unchanged after passing the injected time', async () => {
    const { deps, calls } = createDeps()

    await expect(getReviewQueue(deps, { userId: 'user-1', now: 2 })).resolves.toEqual({
      items: [
        { questionId: 'older', dueAt: 1 },
        { questionId: 'now', dueAt: 2 },
      ],
    })
    expect(calls).toEqual([['user-1', 2]])
  })

  it('returns the repository due count using the same due boundary', async () => {
    const { deps, calls } = createDeps()

    await expect(getDueCount(deps, { userId: 'user-1', now: 2 })).resolves.toEqual({
      dueCount: 2,
    })
    expect(calls).toEqual([['user-1', 2]])
  })
})
