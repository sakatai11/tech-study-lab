import { describe, expect, it } from 'vitest'

import type { McqQuestion, ReviewQueueResponse } from '@tsl/shared'

import { reviewQueueToViewModel } from './mapper'

const firstQuestion: McqQuestion = {
  id: 'security-xss-01-q1',
  type: 'mcq',
  prompt: 'どれ？',
  choices: ['A', 'B', 'C', 'D'],
  answerIndex: 1,
  explanation: '理由',
}

const questions = new Map([[firstQuestion.id, firstQuestion]])
const queue: ReviewQueueResponse = {
  items: [
    { questionId: firstQuestion.id, dueAt: 0 },
    { questionId: 'deleted-question', dueAt: 0 },
  ],
}

describe('reviewQueueToViewModel', () => {
  it('joins API queue metadata with bundled question content on the server boundary', () => {
    const viewModel = reviewQueueToViewModel(queue, questions, 2 * 24 * 60 * 60 * 1000)

    expect(viewModel.dueCount).toBe(1)
    expect(viewModel.previews).toEqual([{ questionId: firstQuestion.id, overdueDays: 2 }])
    expect(viewModel.questions[0]).toEqual({
      id: firstQuestion.id,
      prompt: 'どれ？',
      choices: ['A', 'B', 'C', 'D'],
    })
    expect(viewModel.explanations).toEqual({ [firstQuestion.id]: '理由' })
    expect(viewModel.questions[0]).not.toHaveProperty('answerIndex')
  })

  it('marks a full API batch as eligible for refresh', () => {
    const fullQueue: ReviewQueueResponse = {
      items: Array.from({ length: 20 }, (_, index) => ({
        questionId: `${firstQuestion.id}-${index}`,
        dueAt: 0,
      })),
    }

    expect(reviewQueueToViewModel(fullQueue, questions, 0).hasNextBatch).toBe(true)
  })
})
