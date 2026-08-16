// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ReviewViewModel } from '../../view-model'

const loadReviewOnce = vi.hoisted(() => vi.fn())

vi.mock('../load-review', () => ({ loadReviewOnce }))

vi.mock('@/features/review/client/components/review-runner', () => ({
  ReviewRunner: ({ viewModel }: { viewModel: ReviewViewModel }) => (
    <p>{`runner:${viewModel.hasMore}`}</p>
  ),
}))

import { ReviewUserContent } from './review-user-content'

const viewModel = (overrides: Partial<ReviewViewModel> = {}): ReviewViewModel => ({
  batchKey: 'batch',
  dueCount: 0,
  explanations: {},
  hasMore: false,
  previews: [],
  questions: [],
  resultHomeHref: '/',
  resultHomeLabel: 'ホームへ',
  title: '今日の復習',
  ...overrides,
})

describe('ReviewUserContent', () => {
  afterEach(() => {
    cleanup()
    loadReviewOnce.mockReset()
  })

  it('shows the normal empty-queue card when no displayable question and no next batch remain', async () => {
    loadReviewOnce.mockResolvedValue(viewModel())

    render(await ReviewUserContent())

    expect(screen.getByText('今日は復習済みです')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'ホームへ' })).toHaveProperty(
      'href',
      'http://localhost:3000/',
    )
  })

  it('throws a content-integrity error when no displayable question remains but another batch exists', async () => {
    loadReviewOnce.mockResolvedValue(viewModel({ hasMore: true }))

    await expect(ReviewUserContent()).rejects.toThrow(
      'Review queue has no displayable content while more items remain',
    )
  })

  it.each([false, true])(
    'renders the review runner for displayable questions whether hasMore is %s',
    async (hasMore) => {
      loadReviewOnce.mockResolvedValue(
        viewModel({
          dueCount: 1,
          hasMore,
          previews: [{ overdueDays: 0, questionId: 'security-xss-01-q1' }],
          questions: [
            {
              choices: ['A', 'B', 'C', 'D'],
              id: 'security-xss-01-q1',
              prompt: '問題',
            },
          ],
        }),
      )

      render(await ReviewUserContent())

      expect(screen.getByText(`runner:${hasMore}`)).toBeTruthy()
    },
  )
})
