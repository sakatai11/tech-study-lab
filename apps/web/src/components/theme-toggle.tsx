'use client'

import { useEffect, useState } from 'react'

import { cn } from '@/lib/cn'

type Theme = 'dark' | 'light'

function readTheme(): Theme {
  try {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    setTheme(readTheme())
  }, [])

  const toggleTheme = () => {
    const nextTheme: Theme = readTheme() === 'dark' ? 'light' : 'dark'

    try {
      document.documentElement.dataset.theme = nextTheme
      localStorage.setItem('tsl-theme', nextTheme)
      setTheme(nextTheme)
    } catch {
      document.documentElement.dataset.theme = 'dark'
      setTheme('dark')
    }
  }

  const isLight = theme === 'light'

  return (
    <button
      aria-label={isLight ? 'ダークテーマに切り替える' : 'ライトテーマに切り替える'}
      aria-pressed={isLight}
      className={cn(
        'grid size-11 place-items-center rounded-xl border-2 border-border bg-surface text-mute transition-transform duration-150 hover:text-yellow active:translate-y-0.5',
        className,
      )}
      onClick={toggleTheme}
      type="button"
    >
      <span aria-hidden="true" className="text-lg">
        {isLight ? '☀' : '◐'}
      </span>
    </button>
  )
}
