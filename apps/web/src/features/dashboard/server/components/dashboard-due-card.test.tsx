// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const loadDashboardDueCount = vi.hoisted(() => vi.fn())

vi.mock('@/features/dashboard/server/load-dashboard', () => ({
  loadDashboardDueCount,
}))

import { DashboardDueCard } from './dashboard-due-card'

describe('DashboardDueCard', () => {
  afterEach(() => {
    cleanup()
    loadDashboardDueCount.mockReset()
  })

  it('links to the review queue when questions are due', async () => {
    loadDashboardDueCount.mockResolvedValue({ dueCount: 3 })

    render(await DashboardDueCard())

    expect(screen.getByText('問')).toBeTruthy()
    expect(screen.queryByText(/due/)).toBeNull()
    expect(screen.getByRole('link', { name: '復習を始める' }).getAttribute('href')).toBe('/review')
  })

  it('does not offer an empty review session when nothing is due', async () => {
    loadDashboardDueCount.mockResolvedValue({ dueCount: 0 })

    render(await DashboardDueCard())

    expect(screen.queryByRole('link', { name: '復習を始める' })).toBeNull()
    expect(screen.getByText('今は復習する問題はありません。')).toBeTruthy()
  })

  it('keeps the review link when the due count cannot be loaded', async () => {
    loadDashboardDueCount.mockRejectedValue(new Error('network'))

    render(await DashboardDueCard())

    expect(screen.getByRole('link', { name: '復習を始める' }).getAttribute('href')).toBe('/review')
  })
})
