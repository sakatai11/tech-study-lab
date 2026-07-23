export type ReviewQueueItem = {
  questionId: string
  dueAt: number
}

export type ReviewDeps = {
  findDueQuestions(userId: string, now: number): Promise<ReviewQueueResult>
  countDueQuestions(userId: string, now: number): Promise<number>
}

export type ReviewQueueResult = {
  hasMore: boolean
  items: ReviewQueueItem[]
}

type ReviewInput = {
  userId: string
  now: number
}

export async function getReviewQueue(
  deps: ReviewDeps,
  input: ReviewInput,
): Promise<ReviewQueueResult> {
  return deps.findDueQuestions(input.userId, input.now)
}

export async function getDueCount(
  deps: ReviewDeps,
  input: ReviewInput,
): Promise<{ dueCount: number }> {
  return { dueCount: await deps.countDueQuestions(input.userId, input.now) }
}
