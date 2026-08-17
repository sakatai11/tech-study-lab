// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/dashboard/server/load-dashboard', () => {
  throw new Error('The public product top must not load dashboard data')
})

vi.mock('@/lib/api', () => {
  throw new Error('The public product top must not create an API client')
})

import ProductTopPage from './page'

describe('ProductTopPage', () => {
  afterEach(cleanup)

  it('describes the learning loop and sends both visible login CTAs to /home', () => {
    render(<ProductTopPage />)

    expect(
      screen.getByRole('heading', { name: '実装で使える知識を、学習ループで定着させる。' }),
    ).toBeTruthy()
    expect(screen.getByText('教材を読む')).toBeTruthy()
    expect(screen.getByText('4択で確かめる')).toBeTruthy()
    expect(screen.getByText('SRSで復習する')).toBeTruthy()

    const startLinks = screen.getAllByRole('link', { name: /ログイン/ })
    expect(startLinks).toHaveLength(2)
    for (const link of startLinks) {
      expect(link).toHaveProperty('href', 'http://localhost:3000/home')
    }
  })
})
