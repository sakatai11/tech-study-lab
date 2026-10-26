// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/dashboard/client/components/due-count-badge', () => ({
  DueCountBadge: () => null,
  DueCountProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/features/dashboard/client/components/streak-badge', () => ({ StreakBadge: () => null }))

import { loadQuiz } from '@/features/quiz/server/load-quiz'
import QuizPage from './page'

afterEach(cleanup)

describe('quiz catalog page with bundled content', () => {
  it('exposes all five published lessons with matching exercise routes and active PC/SP navigation', () => {
    render(<QuizPage />)
    expect(screen.getByRole('heading', { level: 1, name: '演習一覧' })).toBeTruthy()
    const catalog = screen.getByRole('main')
    const lessons = [
      ['security-xss-01', 3],
      ['security-csrf-01', 7],
      ['security-sql-injection-01', 7],
      ['frontend-react-01', 7],
      ['backend-auth-01', 7],
    ] as const
    const starts = within(catalog).getAllByRole('link')
    expect(starts.map((link) => link.getAttribute('href'))).toEqual(
      lessons.map(([id]) => `/quiz/${id}`),
    )
    for (const [index, [id, count]] of lessons.entries()) {
      const quiz = loadQuiz(id)
      expect(quiz).toBeDefined()
      expect(starts[index]?.textContent).toContain(quiz?.title)
      expect(starts[index]?.textContent).toContain(`${count}問`)
    }
    for (const name of ['メインナビゲーション', 'モバイルナビゲーション']) {
      const navigation = screen.getByRole('navigation', { name })
      const quizLink = within(navigation).getByRole('link', { name: '演習' })
      expect(quizLink.getAttribute('href')).toBe('/quiz')
      expect(quizLink.getAttribute('aria-current')).toBe('page')
    }
  })
})
