// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/dashboard/client/components/due-count-badge', () => ({
  DueCountBadge: () => <span>due</span>,
  DueCountProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/features/dashboard/server/load-dashboard', () => ({
  loadDashboardStatic: () => ({
    continueHref: '/learn/security/xss/preventing-xss',
    learnHref: '/learn/security/xss/preventing-xss',
    quizHref: '/quiz/preventing-xss',
  }),
}))

import { AppShell } from './app-shell'

describe('AppShell', () => {
  afterEach(cleanup)

  it('uses /home for the selected desktop dashboard and mobile home navigation', () => {
    render(
      <AppShell currentNavigation="dashboard">
        <p>dashboard content</p>
      </AppShell>,
    )

    const desktop = screen.getByRole('navigation', { name: 'メインナビゲーション' })
    const desktopDashboard = desktop.querySelector('a[href="/home"]')
    expect(desktopDashboard).toHaveProperty(
      'textContent',
      expect.stringContaining('ダッシュボード'),
    )
    expect(desktopDashboard?.getAttribute('aria-current')).toBe('page')

    const mobile = screen.getByRole('navigation', { name: 'モバイルナビゲーション' })
    const mobileHome = mobile.querySelector('a[href="/home"]')
    expect(mobileHome).toHaveProperty('textContent', expect.stringContaining('ホーム'))
    expect(mobileHome?.getAttribute('aria-current')).toBe('page')
    expect(desktop.querySelector('a[href="/learn/security/xss/preventing-xss"]')).toHaveProperty(
      'textContent',
      expect.stringContaining('教材'),
    )
    expect(desktop.querySelector('a[href="/review"]')).toHaveProperty(
      'textContent',
      expect.stringContaining('復習'),
    )
    expect(desktop.querySelector('a[href="/analytics"]')).toHaveProperty(
      'textContent',
      expect.stringContaining('アナリティクス'),
    )
  })
})
