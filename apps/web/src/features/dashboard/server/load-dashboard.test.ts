import { afterEach, describe, expect, it, vi } from 'vitest'

const getLessonRouteParams = vi.hoisted(() =>
  vi.fn((): { domain: string; topic: string; lesson: string }[] => []),
)
const getLessonContent = vi.hoisted(() => vi.fn())

vi.mock('@/lib/content', () => ({ getLessonContent, getLessonRouteParams }))

import { loadDashboardStatic } from './load-dashboard'

describe('loadDashboardStatic', () => {
  afterEach(() => {
    getLessonRouteParams.mockReset()
    getLessonRouteParams.mockReturnValue([])
    getLessonContent.mockReset()
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
})
