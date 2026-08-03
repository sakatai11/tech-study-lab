import { describe, expect, it } from 'vitest'

import { type LessonViewDeps, recordLessonView } from './lesson-view-service'

function createDeps(overrides: Partial<LessonViewDeps> = {}) {
  const recorded: Parameters<LessonViewDeps['recordLessonView']>[0][] = []
  const deps: LessonViewDeps = {
    recordLessonView: async (params) => {
      recorded.push(params)
    },
    ...overrides,
  }

  return { deps, recorded }
}

describe('recordLessonView', () => {
  it('records the middleware user and timestamp for the requested lesson', async () => {
    const { deps, recorded } = createDeps()

    await expect(
      recordLessonView(deps, {
        userId: 'user-1',
        lessonId: 'security-xss-01',
        now: 1_700_000_000_000,
      }),
    ).resolves.toBeUndefined()

    expect(recorded).toEqual([
      {
        userId: 'user-1',
        lessonId: 'security-xss-01',
        viewedAt: 1_700_000_000_000,
      },
    ])
  })
})
