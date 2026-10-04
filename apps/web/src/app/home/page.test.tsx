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

vi.mock('@/features/dashboard/server/components/dashboard-page-content', () => ({
  DashboardPageContent: () => <p>dashboard-page-content</p>,
}))

import HomePage from './page'

describe('HomePage', () => {
  afterEach(() => {
    cleanup()
    appShell.mockReset()
  })

  it('composes the dashboard feature content at /home', () => {
    render(<HomePage />)

    expect(appShell).toHaveBeenCalledWith('dashboard')
    expect(screen.getByText('dashboard-page-content')).toBeTruthy()
  })
})
