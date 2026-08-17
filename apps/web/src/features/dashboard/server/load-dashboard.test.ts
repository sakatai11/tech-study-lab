import { describe, expect, it, vi } from 'vitest'

const getLessonRouteParams = vi.hoisted(() => vi.fn(() => []))

vi.mock('@/lib/content', () => ({ getLessonRouteParams }))

import { loadDashboardStatic } from './load-dashboard'

describe('loadDashboardStatic', () => {
  it('uses /home when no bundled lesson is available', () => {
    expect(loadDashboardStatic()).toEqual({
      continueHref: '/home',
      learnHref: undefined,
      quizHref: undefined,
    })
  })
})
