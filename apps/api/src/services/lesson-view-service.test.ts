import { describe, expect, it } from 'vitest'

import { LessonNotFoundError } from './errors'
import { type LessonViewDeps, recordLessonView } from './lesson-view-service'

function createDeps(overrides: Partial<LessonViewDeps> = {}) {
  const recorded: Parameters<LessonViewDeps['recordLessonViewIfLessonExists']>[0][] = []
  const deps: LessonViewDeps = {
    recordLessonViewIfLessonExists: async (params) => {
      recorded.push(params)
      return true
    },
    ...overrides,
  }

  return { deps, recorded }
}

describe('recordLessonView', () => {
  it('ミドルウェアで確定したユーザーと指定時刻で教材閲覧を記録する', async () => {
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

  it('教材が見つからず記録されなかった閲覧を LessonNotFoundError にする [ADR-0022]', async () => {
    const { deps } = createDeps({
      recordLessonViewIfLessonExists: async () => false,
    })

    await expect(
      recordLessonView(deps, {
        userId: 'user-1',
        lessonId: 'missing-lesson-01',
        now: 1_700_000_000_000,
      }),
    ).rejects.toBeInstanceOf(LessonNotFoundError)
  })
})
