// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/dashboard/client/components/due-count-badge', () => ({
  DueCountBadge: () => null,
  DueCountProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/features/dashboard/server/load-dashboard', () => ({
  loadDashboardStatic: () => ({ quizHref: undefined }),
}))

import LearnPage from './page'

describe('learn catalog page', () => {
  afterEach(cleanup)

  it('shows the topic-to-lessons link and empty domains with the shared navigation', () => {
    render(<LearnPage />)

    expect(screen.getByRole('heading', { level: 1, name: '教材一覧' })).toBeTruthy()
    const security = screen.getByRole('region', { name: 'セキュリティ' })
    expect(within(security).getByRole('link').getAttribute('href')).toBe('/learn/security/xss')
    expect(within(security).getByText('1レッスン')).toBeTruthy()

    for (const name of ['フロントエンド', 'バックエンド', 'アーキテクチャ']) {
      const domain = screen.getByRole('region', { name })
      expect(within(domain).getByText(/準備中/)).toBeTruthy()
      expect(within(domain).queryByRole('link')).toBeNull()
    }
    for (const name of ['メインナビゲーション', 'モバイルナビゲーション']) {
      const navigation = screen.getByRole('navigation', { name })
      const learnLink = within(navigation).getByRole('link', { name: /教材/ })
      expect(learnLink.getAttribute('href')).toBe('/learn')
      expect(learnLink.getAttribute('aria-current')).toBe('page')
    }
  })
})
