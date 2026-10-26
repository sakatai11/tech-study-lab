// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/dashboard/client/components/due-count-badge', () => ({
  DueCountBadge: () => null,
  DueCountProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/features/dashboard/client/components/streak-badge', () => ({ StreakBadge: () => null }))

import * as catalog from '@/features/quiz/server/load-catalog'
import { loadQuiz } from '@/features/quiz/server/load-quiz'
import QuizListPage from './page'

describe('quiz catalog page', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('offers all five bundled lessons by domain and topic with their question counts', () => {
    render(<QuizListPage />)
    expect(screen.getByRole('heading', { level: 1, name: '演習一覧' })).toBeTruthy()
    for (const [domain, ids] of [
      ['セキュリティ', ['security-xss-01', 'security-csrf-01', 'security-sql-injection-01']],
      ['フロントエンド', ['frontend-react-01']],
      ['バックエンド', ['backend-auth-01']],
    ] as const) {
      const region = screen.getByRole('region', { name: domain })
      expect(within(region).getAllByRole('link')).toHaveLength(ids.length)
      for (const id of ids) {
        const quiz = loadQuiz(id)
        expect(quiz).toBeDefined()
        const link = within(region).getByRole('link', { name: new RegExp(quiz?.title ?? '') })
        expect(link.getAttribute('href')).toBe(`/quiz/${id}`)
        expect(link.textContent).toContain(`${quiz?.questions.length}問`)
      }
    }
    for (const name of ['メインナビゲーション', 'モバイルナビゲーション']) {
      const link = within(screen.getByRole('navigation', { name })).getByRole('link', {
        name: '演習',
      })
      expect(link.getAttribute('href')).toBe('/quiz')
      expect(link.getAttribute('aria-current')).toBe('page')
    }
  })

  it('keeps exercise navigation available without lessons and offers a lesson catalog fallback', () => {
    vi.spyOn(catalog, 'loadQuizCatalog').mockReturnValue({ domains: [] })
    render(<QuizListPage />)
    expect(screen.getByText('出題できる演習がありません。')).toBeTruthy()
    const main = within(screen.getByRole('main'))
    expect(main.getAllByRole('link')).toHaveLength(1)
    expect(main.getByRole('link', { name: '教材一覧へ' }).getAttribute('href')).toBe('/learn')
    expect(
      screen
        .getAllByRole('link', { name: '演習' })
        .every((link) => link.getAttribute('href') === '/quiz'),
    ).toBe(true)
  })
})
