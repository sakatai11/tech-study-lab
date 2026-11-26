import { describe, expect, it } from 'vitest'

import { LessonNotFoundError } from './errors'
import { type LessonViewDeps, recordLessonView } from './lesson-view-service'

function createDeps(overrides: Partial<LessonViewDeps> = {}) {
  const recorded: Parameters<LessonViewDeps['recordLessonView']>[0][] = []
  const deps: LessonViewDeps = {
    lessonExists: async () => true,
    recordLessonView: async (params) => {
      recorded.push(params)
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

  it('存在しない教材の閲覧は記録せず LessonNotFoundError にする [ADR-0022]', async () => {
    const checkedLessonIds: string[] = []
    const { deps, recorded } = createDeps({
      lessonExists: async (lessonId) => {
        checkedLessonIds.push(lessonId)
        return false
      },
    })

    await expect(
      recordLessonView(deps, {
        userId: 'user-1',
        lessonId: 'missing-lesson-01',
        now: 1_700_000_000_000,
      }),
    ).rejects.toBeInstanceOf(LessonNotFoundError)

    expect(checkedLessonIds).toEqual(['missing-lesson-01'])
    expect(recorded).toEqual([])
  })
})
