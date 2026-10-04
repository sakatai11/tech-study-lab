// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import HomeError from './error'

describe('HomeError', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('offers retry, a safe home escape, and analytics recovery navigation', () => {
    const reset = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(<HomeError error={new Error('redacted in production')} reset={reset} />)

    expect(screen.getByText('ダッシュボードを読み込めませんでした')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(reset).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'ホームへ' })).toHaveProperty(
      'href',
      'http://localhost:3000/',
    )
    expect(screen.getByRole('link', { name: '学習分析を見る' })).toHaveProperty(
      'href',
      'http://localhost:3000/analytics',
    )
  })
})
