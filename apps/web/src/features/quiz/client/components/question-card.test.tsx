// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { QuestionCard } from './question-card'

const question = {
  choices: ['textContent', 'innerHTML', 'eval'],
  id: 'question-1',
  prompt: '安全な API はどれですか？',
}

function renderCard(result?: { correctIndex: number; isCorrect: boolean; selectedIndex: number }) {
  render(
    <QuestionCard
      explanation="解説"
      onAnswer={() => {}}
      onNext={() => {}}
      question={question}
      result={result}
      submitting={false}
    />,
  )
}

describe('QuestionCard', () => {
  afterEach(cleanup)

  it('does not expose the answer state before grading', () => {
    renderCard()

    expect(screen.getByRole('button', { name: '1番 textContent' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '2番 innerHTML' })).toBeTruthy()
    expect(screen.queryByText('正解です')).toBeNull()
  })

  it('names the correct choice and the wrong selection without relying on color', () => {
    renderCard({ correctIndex: 0, isCorrect: false, selectedIndex: 1 })

    expect(screen.getByRole('button', { name: '1番 textContent（正解）' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '2番 innerHTML（あなたの解答）' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '3番 eval' })).toBeTruthy()
    expect(screen.getByText('不正解です')).toBeTruthy()
  })

  it('marks a correct selection as both the answer and the user choice', () => {
    renderCard({ correctIndex: 0, isCorrect: true, selectedIndex: 0 })

    expect(
      screen.getByRole('button', { name: '1番 textContent（正解・あなたの解答）' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: '2番 innerHTML' })).toBeTruthy()
    expect(screen.getByText('正解です')).toBeTruthy()
  })
})
