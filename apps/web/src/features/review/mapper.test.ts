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

const secondQuestion: McqQuestion = {
  id: 'security-xss-01-q2',
  type: 'mcq',
  prompt: 'どっち？',
  choices: ['A', 'B', 'C', 'D'],
  answerIndex: 2,
  explanation: '別の理由',
}

const questions = new Map([
  [firstQuestion.id, firstQuestion],
  [secondQuestion.id, secondQuestion],
])
const queue: ReviewQueueResponse = {
  hasMore: false,
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

  it('preserves the API dueAt order for questions and previews', () => {
    const unorderedQueue: ReviewQueueResponse = {
      hasMore: false,
      items: [
        { questionId: secondQuestion.id, dueAt: 200 },
        { questionId: firstQuestion.id, dueAt: 100 },
      ],
    }

    const viewModel = reviewQueueToViewModel(unorderedQueue, questions, 200)

    expect(viewModel.questions.map(({ id }) => id)).toEqual([secondQuestion.id, firstQuestion.id])
    expect(viewModel.previews).toEqual([
      { questionId: secondQuestion.id, overdueDays: 0 },
      { questionId: firstQuestion.id, overdueDays: 0 },
    ])
  })

  it('uses the API hasMore flag for refresh eligibility', () => {
    const fullQueue: ReviewQueueResponse = {
      hasMore: true,
      items: Array.from({ length: 20 }, (_, index) => ({
        questionId: `${firstQuestion.id}-${index}`,
        dueAt: 0,
      })),
    }

    expect(reviewQueueToViewModel(fullQueue, questions, 0).hasMore).toBe(true)

    expect(reviewQueueToViewModel({ ...fullQueue, hasMore: false }, questions, 0).hasMore).toBe(
      false,
    )
  })
})
