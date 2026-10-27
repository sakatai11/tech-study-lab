// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { DOMAIN_LABELS, domainKeySchema } from '@tsl/shared'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/dashboard/client/components/due-count-badge', () => ({
  DueCountBadge: () => null,
  DueCountProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/features/dashboard/client/components/streak-badge', () => ({ StreakBadge: () => null }))

import * as catalog from '@/features/quiz/server/load-catalog'
import { loadQuiz } from '@/features/quiz/server/load-quiz'
import { getLessonsByTopic, getOrderedTopicRoutes } from '@/lib/content'
import QuizListPage from './page'

describe('quiz catalog page', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('exposes every bundled lesson in display order with matching exercise routes and active PC/SP navigation', () => {
    render(<QuizListPage />)
    expect(screen.getByRole('heading', { level: 1, name: '演習一覧' })).toBeTruthy()
    const catalog = screen.getByRole('main')
    // 一覧のloader・mapperを期待値に使わず、contentから表示順と全件を検証する。
    const lessons = getOrderedTopicRoutes()
      .map((route) => ({ ...route, domain: domainKeySchema.parse(route.domain) }))
      .sort(
        (a, b) =>
          DOMAIN_LABELS[a.domain].order - DOMAIN_LABELS[b.domain].order ||
          a.order - b.order ||
          a.topic.localeCompare(b.topic, 'en'),
      )
      .flatMap(({ domain, topic }) =>
        [...getLessonsByTopic(domain, topic)].sort((a, b) =>
          a.lessonId.localeCompare(b.lessonId, 'en'),
        ),
      )
    expect(lessons.length).toBeGreaterThan(0)
    const starts = within(catalog).getAllByRole('link')
    expect(starts.map((link) => link.getAttribute('href'))).toEqual(
      lessons.map(({ lessonId }) => `/quiz/${lessonId}`),
    )
    for (const [index, lesson] of lessons.entries()) {
      const quiz = loadQuiz(lesson.lessonId)
      expect(quiz).toBeDefined()
      expect(quiz?.title).toBe(lesson.title)
      expect(starts[index]?.textContent).toContain(lesson.title)
      expect(starts[index]?.textContent).toContain(`${lesson.questions.length}問`)
      const region = screen.getByRole('region', { name: DOMAIN_LABELS[lesson.domain].label })
      expect(within(region).getAllByRole('link')).toContain(starts[index])
    }
    for (const name of ['メインナビゲーション', 'モバイルナビゲーション']) {
      const navigation = screen.getByRole('navigation', { name })
      const quizLink = within(navigation).getByRole('link', { name: '演習' })
      expect(quizLink.getAttribute('href')).toBe('/quiz')
      expect(quizLink.getAttribute('aria-current')).toBe('page')
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
