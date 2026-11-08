// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { DashboardDueCard } from './dashboard-due-card'

describe('DashboardDueCard', () => {
  afterEach(cleanup)

  it('links to the review queue when questions are due', () => {
    render(<DashboardDueCard dueCount={3} />)

    expect(screen.getByText('問')).toBeTruthy()
    expect(screen.queryByText(/due/)).toBeNull()
    expect(screen.getByRole('link', { name: '復習を始める' }).getAttribute('href')).toBe('/review')
  })

  it('does not offer an empty review session when nothing is due', () => {
    render(<DashboardDueCard dueCount={0} />)

    expect(screen.queryByRole('link', { name: '復習を始める' })).toBeNull()
    expect(screen.getByText('今は復習する問題はありません。')).toBeTruthy()
  })

  it('keeps the review link when the due count cannot be loaded', () => {
    render(<DashboardDueCard dueCount={null} />)

    expect(screen.getByText(/復習件数を取得できませんでした/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '復習を始める' }).getAttribute('href')).toBe('/review')
  })
})
