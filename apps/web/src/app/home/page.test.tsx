// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const appShell = vi.hoisted(() => vi.fn())

vi.mock('../_components/app-shell', () => ({
  AppShell: ({
    children,
    currentNavigation,
  }: { children: ReactNode; currentNavigation: string }) => {
    appShell(currentNavigation)
    return <div>{children}</div>
  },
}))

vi.mock('@/features/dashboard/server/components/dashboard-due-card', () => ({
  DashboardDueCard: () => <p>due-card</p>,
}))

vi.mock('@/features/dashboard/server/load-dashboard', () => ({
  loadDashboardStatic: () => ({
    continueHref: '/learn/security/xss/preventing-xss',
    learnHref: '/learn/security/xss/preventing-xss',
    quizHref: '/quiz/preventing-xss',
  }),
}))

import HomePage from './page'

describe('HomePage', () => {
  afterEach(() => {
    cleanup()
    appShell.mockReset()
  })

  it('keeps the dashboard composition, due card, and learning links at /home', () => {
    render(<HomePage />)

    expect(appShell).toHaveBeenCalledWith('dashboard')
    expect(screen.getByRole('heading', { name: '開発者のための学習ワークベンチ' })).toBeTruthy()
    expect(screen.getByText('due-card')).toBeTruthy()
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
