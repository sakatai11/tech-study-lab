import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReviewViewModel } from '../../view-model'

const { loadReviewOnceMock } = vi.hoisted(() => ({
  loadReviewOnceMock: vi.fn(),
}))

vi.mock('../load-review', () => ({
  loadReviewOnce: loadReviewOnceMock,
}))

vi.mock('@/features/review/client/components/review-runner', () => ({
  ReviewRunner: () => <div>review runner</div>,
}))

import { ReviewUserContent } from './review-user-content'

const viewModel: ReviewViewModel = {
  batchKey: '',
  dueCount: 0,
  explanations: {},
  hasMore: false,
  previews: [],
  questions: [],
  resultHomeHref: '/',
  resultHomeLabel: 'ホームへ',
  title: '今日の復習',
}

describe('ReviewUserContent', () => {
  beforeEach(() => {
    loadReviewOnceMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the completed empty state when there are no displayable questions or later batches', async () => {
    loadReviewOnceMock.mockResolvedValue(viewModel)

    const content = await ReviewUserContent()

    expect(renderToStaticMarkup(content)).toContain('今日は復習済みです')
  })

  it('throws when no displayable questions are joined but later batches exist', async () => {
    loadReviewOnceMock.mockResolvedValue({ ...viewModel, hasMore: true })

    await expect(ReviewUserContent()).rejects.toThrow('復習キューの整合性を確認できませんでした。')
  })
})
