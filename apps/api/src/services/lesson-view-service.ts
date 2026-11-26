import { LessonNotFoundError } from './errors'

export type LessonViewDeps = {
  /** content から同期した active な教材として存在するかを返す（ADR-0022）。 */
  lessonExists(lessonId: string): Promise<boolean>
  recordLessonView(params: {
    userId: string
    lessonId: string
    viewedAt: number
  }): Promise<void>
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
  if (!(await deps.lessonExists(input.lessonId))) {
    throw new LessonNotFoundError(input.lessonId)
  }

  await deps.recordLessonView({
    userId: input.userId,
    lessonId: input.lessonId,
    viewedAt: input.now,
  })
}
