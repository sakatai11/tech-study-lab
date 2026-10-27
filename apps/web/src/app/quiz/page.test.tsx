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

import { loadQuiz } from '@/features/quiz/server/load-quiz'
import { getLessonsByTopic, getOrderedTopicRoutes } from '@/lib/content'
import QuizPage from './page'

afterEach(cleanup)

describe('quiz catalog page with bundled content', () => {
  it('exposes every bundled lesson in display order with matching exercise routes and active PC/SP navigation', () => {
    render(<QuizPage />)
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
    }
    for (const name of ['メインナビゲーション', 'モバイルナビゲーション']) {
      const navigation = screen.getByRole('navigation', { name })
      const quizLink = within(navigation).getByRole('link', { name: '演習' })
      expect(quizLink.getAttribute('href')).toBe('/quiz')
      expect(quizLink.getAttribute('aria-current')).toBe('page')
    }
  })
})
