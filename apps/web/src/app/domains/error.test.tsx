// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import DomainsError from './error'

describe('DomainsError', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows retrieval failure separately from an empty progress state and offers retry', () => {
    const reset = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(<DomainsError error={new Error('redacted in production')} reset={reset} />)

    expect(screen.getByText('学習領域を読み込めませんでした')).toBeTruthy()
    expect(screen.queryByText('準備中')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(reset).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'ホームへ' })).toHaveProperty(
      'href',
      'http://localhost:3000/home',
    )
  })
})
