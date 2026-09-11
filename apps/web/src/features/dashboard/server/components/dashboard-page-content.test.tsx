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

  it('keeps the dashboard content, due card, and learning links', () => {
    loadDashboardStatic.mockReturnValue({
      continueHref: '/learn/security/xss/preventing-xss',
      learnHref: '/learn/security/xss/preventing-xss',
      quizHref: '/quiz/preventing-xss',
    })

    render(<DashboardPageContent />)

    expect(screen.getByRole('heading', { name: '開発者のための学習ワークベンチ' })).toBeTruthy()
    expect(screen.getByText('due-card')).toBeTruthy()
    expect(screen.getByText('dashboard-user-content')).toBeTruthy()
    expect(screen.queryByText('表示用サンプル')).toBeNull()
    expect(screen.getByRole('link', { name: '復習を始める' })).toHaveProperty(
      'href',
      'http://localhost:3000/review',
    )
    expect(screen.getByRole('link', { name: '続きから' })).toHaveProperty(
      'href',
      'http://localhost:3000/learn/security/xss/preventing-xss',
    )
  })
})
