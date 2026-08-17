// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ReviewError from './error'

describe('ReviewError', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('explains both retrieval and content-integrity failures and offers retry and Home navigation', () => {
    const reset = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(<ReviewError error={new Error('redacted in production')} reset={reset} />)

    expect(screen.getByText('復習データを読み込めませんでした')).toBeTruthy()
    expect(screen.getByText(/一時的な通信の問題/)).toBeTruthy()
    expect(screen.getByText(/教材コンテンツとの不整合/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(reset).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'ホームへ' })).toHaveProperty(
      'href',
      'http://localhost:3000/home',
    )
  })
})
