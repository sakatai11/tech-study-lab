import { type SrsInput, type SrsResult, initialSrs, reviewSrs } from '@tsl/shared'

import { QuestionNotFoundError, SrsConflictError } from './errors'

export type VersionedSrsInput = SrsInput & { version: number }

export type AnswerDeps = {
  findAnswerIndex(questionId: string): Promise<number | null>
  findSrsState(userId: string, questionId: string): Promise<VersionedSrsInput | null>
  recordAnswer(params: {
    userId: string
    questionId: string
    isCorrect: boolean
    answeredAt: number
    responseTimeMs?: number
    nextSrs: SrsResult
    expectedVersion: number
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

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentSrs = (await deps.findSrsState(input.userId, input.questionId)) ?? {
      ...initialSrs(),
      version: 0,
    }
    const nextSrs = reviewSrs(currentSrs, isCorrect, input.now)

    try {
      await deps.recordAnswer({
        userId: input.userId,
        questionId: input.questionId,
        isCorrect,
        answeredAt: input.now,
        responseTimeMs: input.responseTimeMs,
        nextSrs,
        expectedVersion: currentSrs.version,
      })

      return { isCorrect, correctIndex: answerIndex }
    } catch (error) {
      if (!(error instanceof SrsConflictError) || attempt === 2) {
        throw error
      }
    }
  }

  throw new Error('Unreachable SRS retry state')
}
