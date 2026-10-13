// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { submitAnswer } = vi.hoisted(() => ({ submitAnswer: vi.fn() }))

vi.mock('@/lib/api', () => ({ createBrowserApiClient: vi.fn(() => ({})) }))
vi.mock('@/features/quiz/api/quiz-api', () => ({ submitAnswer }))

import { QuizInteractive } from './quiz-interactive'

const question = {
  choices: ['選択肢 1', '選択肢 2'],
  id: 'question-1',
  prompt: '問題文',
}

describe('QuizInteractive', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders an empty state instead of a start action when there are no questions', () => {
    const { rerender } = render(
      <QuizInteractive
        explanations={{}}
        questions={[]}
        resultHomeHref="/learn/security/xss"
        resultHomeLabel="レッスンへ戻る"
        title="XSS 演習"
      />,
    )

    expect(screen.getByText('出題できる問題がありません')).toBeTruthy()
    const resultHomeLink = screen.getByRole('link', { name: 'レッスンへ戻る' })
    expect(resultHomeLink.getAttribute('href')).toBe('/learn/security/xss')
    expect(screen.queryByRole('button', { name: '演習を開始' })).toBeNull()
    expect(screen.queryByText('quiz / exercise')).toBeNull()

    rerender(
      <QuizInteractive
        explanations={{}}
        questions={[question]}
        resultHomeHref="/learn/security/xss"
        resultHomeLabel="レッスンへ戻る"
        title="XSS 演習"
      />,
    )

    expect(screen.getByText('quiz / intro')).toBeTruthy()
    expect(screen.getByRole('button', { name: '演習を開始' })).toBeTruthy()
  })

  it('labels the last step and the retry actions by what they do', async () => {
    submitAnswer.mockResolvedValue({ correctIndex: 0, isCorrect: false })
    render(
      <QuizInteractive
        explanations={{ 'question-1': '解説' }}
        questions={[question]}
        resultHomeHref="/learn/security/xss"
        resultHomeLabel="レッスン一覧へ"
        title="XSS 演習"
      />,
    )

    expect(screen.getByText(/解答の結果は復習の予定に反映されます/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '演習を開始' }))
    fireEvent.click(screen.getByRole('button', { name: '2番 選択肢 2' }))
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: '結果を見る' }) as HTMLButtonElement).disabled,
      ).toBe(false)
    })
    expect(screen.queryByRole('button', { name: '次へ' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '結果を見る' }))

    expect(screen.getByText('quiz / result')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '演習完了' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'すべて解き直す' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '間違えた問題を解き直す' }))
    expect(screen.getByText('quiz / exercise')).toBeTruthy()
  })
})
