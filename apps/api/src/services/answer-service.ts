import { type SrsInput, type SrsResult, initialSrs, reviewSrs } from '@tsl/shared'

import { QuestionNotFoundError } from './errors'

export type AnswerDeps = {
  findAnswerIndex(questionId: string): Promise<number | null>
  findSrsState(userId: string, questionId: string): Promise<SrsInput | null>
  recordAnswer(params: {
    userId: string
    questionId: string
    isCorrect: boolean
    answeredAt: number
    responseTimeMs?: number
    nextSrs: SrsResult
  }): Promise<void>
}

export type SubmitAnswerInput = {
  userId: string
  questionId: string
  selectedIndex: number
  responseTimeMs?: number
  now: number
}

export async function submitAnswer(
  deps: AnswerDeps,
  input: SubmitAnswerInput,
): Promise<{ isCorrect: boolean; correctIndex: number }> {
  const answerIndex = await deps.findAnswerIndex(input.questionId)
  if (answerIndex === null) {
    throw new QuestionNotFoundError(input.questionId)
  }

  const isCorrect = answerIndex === input.selectedIndex
  const currentSrs = (await deps.findSrsState(input.userId, input.questionId)) ?? initialSrs()
  const nextSrs = reviewSrs(currentSrs, isCorrect, input.now)

  await deps.recordAnswer({
    userId: input.userId,
    questionId: input.questionId,
    isCorrect,
    answeredAt: input.now,
    responseTimeMs: input.responseTimeMs,
    nextSrs,
  })

  return { isCorrect, correctIndex: answerIndex }
}
