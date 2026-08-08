// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { QuizInteractive } from './quiz-interactive'

describe('QuizInteractive', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders an empty state instead of a start action when there are no questions', () => {
    render(
      <QuizInteractive
        explanations={{}}
        questions={[]}
        resultHomeHref="/learn/security/xss"
        resultHomeLabel="レッスンへ戻る"
        title="XSS 演習"
      />,
    )

    expect(screen.getByText('この演習には問題がありません。')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '演習を開始 →' })).toBeNull()
    expect(screen.queryByText('quiz / exercise')).toBeNull()
  })
})
