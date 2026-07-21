export type ReviewQueueItem = {
  questionId: string
  dueAt: number
}

export type ReviewDeps = {
  findDueQuestions(userId: string, now: number): Promise<ReviewQueueItem[]>
  countDueQuestions(userId: string, now: number): Promise<number>
}

type ReviewInput = {
  userId: string
  now: number
}

export async function getReviewQueue(
  deps: ReviewDeps,
  input: ReviewInput,
): Promise<{ items: ReviewQueueItem[] }> {
  return { items: await deps.findDueQuestions(input.userId, input.now) }
}

export async function getDueCount(
  deps: ReviewDeps,
  input: ReviewInput,
): Promise<{ dueCount: number }> {
  return { dueCount: await deps.countDueQuestions(input.userId, input.now) }
}
