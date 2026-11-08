import { afterEach, describe, expect, it, vi } from 'vitest'

const getLessonRouteParams = vi.hoisted(() =>
  vi.fn((): { domain: string; topic: string; lesson: string }[] => []),
)
const getLessonContent = vi.hoisted(() => vi.fn())
const getOrderedTopicRoutes = vi.hoisted(() =>
  vi.fn((): { domain: string; topic: string; order: number }[] => []),
)

vi.mock('@/lib/content', () => ({
  getLessonContent,
  getLessonRouteParams,
  getOrderedTopicRoutes,
}))

import { loadDashboardStatic, loadLessonTitles } from './load-dashboard'

describe('loadDashboardStatic', () => {
  afterEach(() => {
    getLessonRouteParams.mockReset()
    getLessonRouteParams.mockReturnValue([])
    getLessonContent.mockReset()
    getOrderedTopicRoutes.mockReset()
    getOrderedTopicRoutes.mockReturnValue([])
  })

  it('uses /home when no bundled lesson is available', () => {
    expect(loadDashboardStatic()).toEqual({
      continueHref: '/home',
      learnHref: undefined,
      quizHref: undefined,
    })
  })

  it('exposes the first bundled lesson metadata for the next-lesson card', () => {
    getLessonRouteParams.mockReturnValue([
      { domain: 'security', topic: 'xss', lesson: 'security-xss-01' },
    ])
    getLessonContent.mockReturnValue({
      title: 'XSSを防ぐ安全な画面表示',
      estimatedMinutes: 18,
      questions: [{ id: 'q1' }],
    })

    expect(loadDashboardStatic()).toEqual({
      continueHref: '/learn/security/xss/security-xss-01',
      continueTitle: 'XSSを防ぐ安全な画面表示',
      continueEstimatedMinutes: 18,
      continueQuestionCount: 1,
      learnHref: '/learn/security/xss/security-xss-01',
      quizHref: '/quiz/security-xss-01',
    })
  })

  it('picks the first lesson by domain order, topic order, then lesson ID across domains', () => {
    // bundle は content/ のパス順なので backend が先に来る。表示順では security が先頭。
    getLessonRouteParams.mockReturnValue([
      { domain: 'backend', topic: 'auth', lesson: 'backend-auth-01' },
      { domain: 'frontend', topic: 'react', lesson: 'frontend-react-01' },
      { domain: 'security', topic: 'csrf', lesson: 'security-csrf-01' },
      {
        domain: 'security',
        topic: 'sql-injection',
        lesson: 'security-sql-injection-01',
      },
      { domain: 'security', topic: 'xss', lesson: 'security-xss-02' },
      { domain: 'security', topic: 'xss', lesson: 'security-xss-01' },
    ])
    getOrderedTopicRoutes.mockReturnValue([
      { domain: 'backend', topic: 'auth', order: 0 },
      { domain: 'frontend', topic: 'react', order: 0 },
      { domain: 'security', topic: 'csrf', order: 1 },
      { domain: 'security', topic: 'sql-injection', order: 2 },
      { domain: 'security', topic: 'xss', order: 0 },
    ])
    getLessonContent.mockImplementation((lesson: string) =>
      lesson === 'security-xss-01'
        ? {
            title: 'XSSを防ぐ安全な画面表示',
            estimatedMinutes: 18,
            questions: [{ id: 'q1' }],
          }
        : { title: lesson, estimatedMinutes: 10, questions: [] },
    )

    expect(loadDashboardStatic()).toMatchObject({
      continueHref: '/learn/security/xss/security-xss-01',
      continueTitle: 'XSSを防ぐ安全な画面表示',
      learnHref: '/learn/security/xss/security-xss-01',
      quizHref: '/quiz/security-xss-01',
    })
  })

  it('falls back to the next domain when the leading domain has no lessons', () => {
    getLessonRouteParams.mockReturnValue([
      { domain: 'backend', topic: 'auth', lesson: 'backend-auth-01' },
      { domain: 'frontend', topic: 'react', lesson: 'frontend-react-01' },
    ])
    getOrderedTopicRoutes.mockReturnValue([
      { domain: 'backend', topic: 'auth', order: 0 },
      { domain: 'frontend', topic: 'react', order: 0 },
      { domain: 'security', topic: 'xss', order: 0 },
    ])

    expect(loadDashboardStatic().quizHref).toBe('/quiz/frontend-react-01')
  })
})

describe('loadLessonTitles [ADR-0019]', () => {
  afterEach(() => {
    getLessonRouteParams.mockReset()
    getLessonRouteParams.mockReturnValue([])
    getLessonContent.mockReset()
  })

  it('maps bundled lesson IDs to titles as serializable props', () => {
    getLessonRouteParams.mockReturnValue([
      { domain: 'security', topic: 'xss', lesson: 'lesson-1' },
      { domain: 'security', topic: 'xss', lesson: 'missing' },
    ])
    getLessonContent.mockImplementation((lesson: string) =>
      lesson === 'lesson-1' ? { title: 'XSS lesson' } : undefined,
    )

    expect(loadLessonTitles()).toEqual({ 'lesson-1': 'XSS lesson' })
  })
})
