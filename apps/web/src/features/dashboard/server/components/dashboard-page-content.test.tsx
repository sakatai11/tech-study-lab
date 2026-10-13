// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const loadDashboardStatic = vi.hoisted(() => vi.fn())

vi.mock('@/features/dashboard/server/components/dashboard-due-card', () => ({
  DashboardDueCard: () => <p>due-card</p>,
}))

vi.mock('@/features/dashboard/server/components/dashboard-user-content', () => ({
  DashboardUserContent: () => <p>dashboard-user-content</p>,
}))

vi.mock('@/features/dashboard/server/load-dashboard', () => ({ loadDashboardStatic }))

import { DashboardPageContent } from './dashboard-page-content'

describe('DashboardPageContent', () => {
  afterEach(() => {
    cleanup()
    loadDashboardStatic.mockReset()
  })

  it('keeps the dashboard content, due card, and learning links', async () => {
    loadDashboardStatic.mockReturnValue({
      continueHref: '/learn/security/xss/preventing-xss',
      learnHref: '/learn/security/xss/preventing-xss',
      quizHref: '/quiz/preventing-xss',
    })

    render(await DashboardPageContent())

    expect(screen.getByRole('heading', { name: '今日の学習' })).toBeTruthy()
    expect(screen.getByText('due-card')).toBeTruthy()
    expect(screen.getByText('dashboard-user-content')).toBeTruthy()
    expect(screen.queryByText('表示用サンプル')).toBeNull()
    // 復習への導線は due 件数を知る DashboardDueCard だけが持つ。
    expect(screen.queryByRole('link', { name: '復習を始める' })).toBeNull()
    expect(screen.getByRole('link', { name: '教材を読む' })).toHaveProperty(
      'href',
      'http://localhost:3000/learn/security/xss/preventing-xss',
    )
  })

  it('does not show a next-lesson card when no bundled lesson is available', async () => {
    loadDashboardStatic.mockReturnValue({
      continueHref: '/home',
      learnHref: undefined,
      quizHref: undefined,
    })

    render(await DashboardPageContent())

    expect(screen.queryByText('LESSON')).toBeNull()
    expect(screen.queryByRole('link', { name: '教材を読む' })).toBeNull()
  })
})
