import { describe, expect, it } from 'vitest'

import { getBundledQuestions } from '@/lib/content'

import { loadReviewQuestionIndex } from './load-review-index'

describe('loadReviewQuestionIndex [ADR-0019]', () => {
  it('lists every bundled question without the answer [ADR-0002]', () => {
    const index = loadReviewQuestionIndex()

    expect(index.map(({ id }) => id)).toEqual([...getBundledQuestions().keys()])
    for (const entry of index) {
      expect(Object.keys(entry).sort()).toEqual(['choices', 'explanation', 'id', 'prompt'])
    }
    expect(JSON.stringify(index)).not.toMatch(/answerIndex/)
  })
})
