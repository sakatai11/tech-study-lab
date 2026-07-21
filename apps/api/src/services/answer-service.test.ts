import { DAY_MS, type SrsInput } from '@tsl/shared'
import { describe, expect, it } from 'vitest'

import { type AnswerDeps, submitAnswer } from './answer-service'
import { QuestionNotFoundError, SrsConflictError } from './errors'

function createDeps(overrides: Partial<AnswerDeps> = {}) {
  const recorded: Parameters<AnswerDeps['recordAnswer']>[0][] = []
  const deps: AnswerDeps = {
    findAnswerIndex: async () => 2,
    findSrsState: async () => null,
    recordAnswer: async (params) => {
      recorded.push(params)
    },
    ...overrides,
  }

  return { deps, recorded }
}

describe('submitAnswer', () => {
  it('grades against the stored answer and records the initial SRS transition', async () => {
    const { deps, recorded } = createDeps()

    await expect(
      submitAnswer(deps, {
        userId: 'user-1',
        questionId: 'question-1',
        selectedIndex: 2,
        responseTimeMs: 1_200,
        now: 0,
      }),
    ).resolves.toEqual({ isCorrect: true, correctIndex: 2 })

    expect(recorded).toEqual([
      {
        userId: 'user-1',
        questionId: 'question-1',
        isCorrect: true,
        answeredAt: 0,
        responseTimeMs: 1_200,
        expectedVersion: 0,
        nextSrs: {
          ease: 2500,
          intervalDays: 1,
          reps: 1,
          lapses: 0,
          dueAt: DAY_MS,
        },
      },
    ])
  })

  it('uses the existing SRS state when recording an incorrect answer', async () => {
    const state: SrsInput & { version: number } = {
      ease: 1700,
      intervalDays: 6,
      reps: 2,
      lapses: 1,
      version: 0,
    }
    const { deps, recorded } = createDeps({ findSrsState: async () => state })

    await expect(
      submitAnswer(deps, {
        userId: 'user-1',
        questionId: 'question-1',
        selectedIndex: 0,
        now: 100,
      }),
    ).resolves.toEqual({ isCorrect: false, correctIndex: 2 })

    expect(recorded[0]?.nextSrs).toEqual({
      ease: 1500,
      intervalDays: 1,
      reps: 0,
      lapses: 2,
      dueAt: 100 + DAY_MS,
    })
    expect(recorded[0]?.expectedVersion).toBe(0)
    expect(recorded[0]?.responseTimeMs).toBeUndefined()
  })

  it('rejects a question absent from the authoritative question cache', async () => {
    const { deps, recorded } = createDeps({ findAnswerIndex: async () => null })

    await expect(
      submitAnswer(deps, {
        userId: 'user-1',
        questionId: 'missing-question',
        selectedIndex: 0,
        now: 0,
      }),
    ).rejects.toBeInstanceOf(QuestionNotFoundError)

    expect(recorded).toEqual([])
  })

  it('retries from the latest SRS version after a concurrent update', async () => {
    const states: (SrsInput & { version: number })[] = [
      { ease: 2500, intervalDays: 1, reps: 1, lapses: 0, version: 0 },
      { ease: 2500, intervalDays: 1, reps: 1, lapses: 0, version: 1 },
    ]
    let reads = 0
    let writes = 0
    const { deps } = createDeps({
      findSrsState: async () => states[Math.min(reads++, states.length - 1)] ?? null,
      recordAnswer: async (params) => {
        writes += 1
        if (writes === 1) {
          throw new SrsConflictError(params.userId, params.questionId)
        }
      },
    })

    await expect(
      submitAnswer(deps, {
        userId: 'user-1',
        questionId: 'question-1',
        selectedIndex: 2,
        now: 100,
      }),
    ).resolves.toEqual({ isCorrect: true, correctIndex: 2 })

    expect(writes).toBe(2)
  })
})
