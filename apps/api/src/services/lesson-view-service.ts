export type LessonViewDeps = {
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
  await deps.recordLessonView({
    userId: input.userId,
    lessonId: input.lessonId,
    viewedAt: input.now,
  })
}
