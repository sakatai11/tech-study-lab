// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ThemeToggle } from './theme-toggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = 'dark'
    localStorage.clear()
  })

  afterEach(cleanup)

  it('describes the switch action and persists the next theme', () => {
    render(<ThemeToggle />)

    const toLight = screen.getByRole('button', { name: 'ライトテーマに切り替える' })
    expect(toLight.hasAttribute('aria-pressed')).toBe(false)

    fireEvent.click(toLight)

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('tsl-theme')).toBe('light')
    expect(screen.getByRole('button', { name: 'ダークテーマに切り替える' })).toBeTruthy()
  })
})
