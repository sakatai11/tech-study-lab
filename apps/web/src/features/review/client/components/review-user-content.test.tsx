// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ReviewQueueResponse } from '@tsl/shared'

import type { ReviewQuestionIndexEntry, ReviewViewModel } from '../../view-model'

const { fetchReviewQueue, createBrowserApiClient } = vi.hoisted(() => ({
  fetchReviewQueue: vi.fn<() => Promise<ReviewQueueResponse>>(),
  createBrowserApiClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/api', () => ({ createBrowserApiClient }))
vi.mock('../../api/review-api', () => ({ fetchReviewQueue }))
vi.mock('./review-runner', () => ({
  ReviewRunner: ({
    onNextBatch,
    viewModel,
  }: {
    onNextBatch: () => void
    viewModel: ReviewViewModel
  }) => (
    <button onClick={onNextBatch} type="button">
      {`runner:${viewModel.questions.map(({ id }) => id).join(',')}:${viewModel.hasMore}`}
    </button>
  ),
}))

import { ReviewDueBadge } from './review-due-badge'
import { ReviewQueueProvider } from './review-queue-provider'
import { ReviewUserContent } from './review-user-content'

const index: ReviewQuestionIndexEntry[] = [
  { id: 'q1', prompt: '問題1', choices: ['A', 'B'], explanation: '解説1' },
  { id: 'q2', prompt: '問題2', choices: ['A', 'B'], explanation: '解説2' },
]

function renderReview() {
  return render(
    <ReviewQueueProvider index={index}>
      <ReviewDueBadge />
      <ReviewUserContent />
    </ReviewQueueProvider>,
  )
}

describe('ReviewUserContent [ADR-0019]', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows the loading state before the queue arrives', () => {
    fetchReviewQueue.mockReturnValue(new Promise(() => {}))
    renderReview()

    expect(screen.getByRole('status').textContent).toContain('復習する問題を読み込んでいます')
    expect(screen.queryByText(/問$/)).toBeNull()
  })

  it('joins the queue with the static index and shares one request with the badge', async () => {
    fetchReviewQueue.mockResolvedValue({
      hasMore: true,
      items: [
        { questionId: 'q2', dueAt: 0 },
        { questionId: 'deleted', dueAt: 0 },
      ],
    })
    renderReview()

    expect(await screen.findByRole('button', { name: 'runner:q2:true' })).toBeTruthy()
    expect(screen.getByText('1問')).toBeTruthy()
    expect(fetchReviewQueue).toHaveBeenCalledTimes(1)
  })

  it('loads the next batch only when the runner asks for it', async () => {
    fetchReviewQueue
      .mockResolvedValueOnce({
        hasMore: true,
        items: [{ questionId: 'q1', dueAt: 0 }],
      })
      .mockResolvedValueOnce({
        hasMore: false,
        items: [{ questionId: 'q2', dueAt: 0 }],
      })
    renderReview()

    fireEvent.click(await screen.findByRole('button', { name: 'runner:q1:true' }))

    expect(await screen.findByRole('button', { name: 'runner:q2:false' })).toBeTruthy()
    expect(fetchReviewQueue).toHaveBeenCalledTimes(2)
  })

  it('shows the loading state while the next batch loads and an error with a retry when it fails', async () => {
    let rejectNext: (reason?: unknown) => void = () => {}
    fetchReviewQueue
      .mockResolvedValueOnce({ hasMore: true, items: [{ questionId: 'q1', dueAt: 0 }] })
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectNext = reject
        }),
      )
    renderReview()

    fireEvent.click(await screen.findByRole('button', { name: 'runner:q1:true' }))

    expect(screen.getByRole('status').textContent).toContain('復習する問題を読み込んでいます')
    expect(screen.queryByRole('button', { name: 'runner:q1:true' })).toBeNull()
    rejectNext(new Error('offline'))
    expect(await screen.findByText('復習データを読み込めませんでした')).toBeTruthy()
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeTruthy()
  })

  it('shows the normal empty-queue card when nothing is due and no batch remains', async () => {
    fetchReviewQueue.mockResolvedValue({ hasMore: false, items: [] })
    renderReview()

    expect(await screen.findByText('今は復習する問題はありません')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'ホームへ' }).getAttribute('href')).toBe('/home')
  })

  it.each([
    ['a request failure', () => fetchReviewQueue.mockRejectedValueOnce(new Error('offline'))],
    [
      'a content-integrity failure',
      () =>
        fetchReviewQueue.mockResolvedValueOnce({
          hasMore: true,
          items: [{ questionId: 'deleted', dueAt: 0 }],
        }),
    ],
  ])('offers a retry and a way home after %s', async (_, arrange) => {
    arrange()
    fetchReviewQueue.mockResolvedValueOnce({
      hasMore: false,
      items: [{ questionId: 'q1', dueAt: 0 }],
    })
    renderReview()

    expect(await screen.findByText('復習データを読み込めませんでした')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'ホームへ' }).getAttribute('href')).toBe('/home')
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'runner:q1:false' })).toBeTruthy(),
    )
  })
})
