// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

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
    expect(screen.queryByRole('button', { name: '演習を開始 →' })).toBeNull()
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
    expect(screen.getByRole('button', { name: '演習を開始 →' })).toBeTruthy()
  })
})
