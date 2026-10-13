// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ThemeToggle } from './theme-toggle'

// jsdom 環境の import.meta.url は file: ではないため、パッケージルート（vitest の root）から読む。
const globalsCss = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
// jsdom は Tailwind を処理しないため、出し分け規則だけを読み込む。
const themeRule = globalsCss.slice(globalsCss.indexOf(':root[data-theme="light"] .theme-when-dark'))

describe('ThemeToggle', () => {
  const style = document.createElement('style')

  beforeAll(() => {
    style.textContent = themeRule
    document.head.appendChild(style)
  })

  afterAll(() => {
    style.remove()
  })

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(cleanup)

  it('describes switching to light from the first render in the dark theme', () => {
    document.documentElement.dataset.theme = 'dark'
    render(<ThemeToggle />)

    const toLight = screen.getByRole('button', { name: 'ライトテーマに切り替える' })
    expect(toLight.hasAttribute('aria-pressed')).toBe(false)

    fireEvent.click(toLight)

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('tsl-theme')).toBe('light')
    expect(screen.getByRole('button', { name: 'ダークテーマに切り替える' })).toBeTruthy()
  })

  it('describes switching to dark from the first render in the light theme', () => {
    document.documentElement.dataset.theme = 'light'
    render(<ThemeToggle />)

    expect(screen.getByRole('button', { name: 'ダークテーマに切り替える' })).toBeTruthy()
  })
})
