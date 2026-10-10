// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReviewViewModel } from '../../view-model'
import { ReviewRunner } from './review-runner'

const { refresh, submitAnswer, createBrowserApiClient } = vi.hoisted(() => ({
  refresh: vi.fn(),
  submitAnswer: vi.fn(),
  createBrowserApiClient: vi.fn(() => ({})),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/lib/api', () => ({ createBrowserApiClient }))
vi.mock('@/features/quiz/api/quiz-api', () => ({ submitAnswer }))

function batch(ids: string[], hasMore: boolean): ReviewViewModel {
  return {
    batchKey: ids.map((id) => `${id}:100`).join('|'),
    dueCount: ids.length,
    hasMore,
    explanations: Object.fromEntries(ids.map((id) => [id, `${id}の解説`])),
    questions: ids.map((id) => ({
      id,
      prompt: `${id}の問題`,
      choices: ['正しい選択', '誤った選択'],
    })),
    previews: ids.map((questionId) => ({ questionId, overdueDays: 1 })),
    resultHomeHref: '/home',
    resultHomeLabel: 'ホームへ',
    title: '今日の復習',
  }
}

async function answerCurrentQuestion() {
  fireEvent.click(screen.getByRole('button', { name: '1番 正しい選択' }))
  await waitFor(() => {
    expect((screen.getByRole('button', { name: '次へ →' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })
  // A disabled fieldset disables its buttons without setting button.disabled.
  expect(screen.getByRole('button', { name: '2番 誤った選択' }).matches(':disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '次へ →' }))
}

describe('ReviewRunner batch completion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    submitAnswer.mockResolvedValue({ correctIndex: 0, isCorrect: true })
  })

  afterEach(cleanup)

  it('fetches the next batch after 20 answers and starts it without previous results', async () => {
    const ids = Array.from({ length: 20 }, (_, index) => `question-${index + 1}`)
    const { rerender } = render(<ReviewRunner viewModel={batch(ids, true)} />)
    fireEvent.click(screen.getByRole('button', { name: '復習を開始 →' }))

    for (const id of ids) {
      expect(screen.getByRole('heading', { name: `${id}の問題` })).toBeTruthy()
      await answerCurrentQuestion()
    }

    expect(screen.getByRole('heading', { name: '演習完了' })).toBeTruthy()
    expect(submitAnswer).toHaveBeenCalledTimes(20)
    expect(createBrowserApiClient).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '次の復習を取得 →' }))
    expect(refresh).toHaveBeenCalledTimes(1)

    rerender(<ReviewRunner viewModel={batch(['question-21'], false)} />)
    expect(screen.queryByRole('heading', { name: '演習完了' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '復習を開始 →' }))
    expect(screen.getByRole('heading', { name: 'question-21の問題' })).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: '1番 正しい選択' }) as HTMLButtonElement).disabled,
    ).toBe(false)
    expect(screen.queryByText('正解です')).toBeNull()
    await answerCurrentQuestion()
    expect(submitAnswer).toHaveBeenCalledTimes(21)
    expect(screen.queryByRole('button', { name: '次の復習を取得 →' })).toBeNull()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('completes the last batch without offering another fetch', async () => {
    render(<ReviewRunner viewModel={batch(['question-last'], false)} />)
    fireEvent.click(screen.getByRole('button', { name: '復習を開始 →' }))
    await answerCurrentQuestion()
    expect(screen.getByRole('heading', { name: '演習完了' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '次の復習を取得 →' })).toBeNull()
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'ホームへ' }).getAttribute('href')).toBe('/home')
  })
})
