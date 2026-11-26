import { LessonNotFoundError } from './errors'

export type LessonViewDeps = {
  /**
   * 同期済みの active な教材であれば閲覧を記録し、true を返す。
   * 照合と記録は1つの書き込みで行い、教材が見つからなければ何も記録せず false を返す（ADR-0022）。
   */
  recordLessonViewIfLessonExists(params: {
    userId: string
    lessonId: string
    viewedAt: number
  }): Promise<boolean>
}

export type RecordLessonViewInput = {
  userId: string
  lessonId: string
  now: number
}

export async function recordLessonView(
  deps: LessonViewDeps,
  input: RecordLessonViewInput,
): Promise<void> {
  const recorded = await deps.recordLessonViewIfLessonExists({
    userId: input.userId,
    lessonId: input.lessonId,
    viewedAt: input.now,
  })

  if (!recorded) {
    throw new LessonNotFoundError(input.lessonId)
  }
}
