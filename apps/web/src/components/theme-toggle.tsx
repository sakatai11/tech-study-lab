'use client'

import { MaterialSymbol } from '@/components/ui/material-symbol'
import { cn } from '@/lib/cn'

type Theme = 'dark' | 'light'

function readTheme(): Theme {
  try {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/**
 * アイコンと読み上げ名は、描画前に確定する `html[data-theme]` に応じて CSS で出し分ける。
 * React の state を初期値から補正しないため、ライトテーマでも初回描画から正しい表示になる。
 */
export function ThemeToggle({ className }: { className?: string }) {
  const toggleTheme = () => {
    const nextTheme: Theme = readTheme() === 'dark' ? 'light' : 'dark'

    document.documentElement.dataset.theme = nextTheme

    try {
      localStorage.setItem('tsl-theme', nextTheme)
    } catch {
      // ストレージが使えない場合も、現在のセッションのテーマを維持する。
    }
  }

  return (
    <button
      className={cn(
        'grid size-11 place-items-center rounded-xl border-2 border-border bg-surface text-mute transition-transform duration-150 hover:text-yellow active:translate-y-0.5',
        className,
      )}
      onClick={toggleTheme}
      type="button"
    >
      <span className="theme-when-dark grid place-items-center">
        <MaterialSymbol className="size-5" name="light_mode" />
        <span className="sr-only">ライトテーマに切り替える</span>
      </span>
      <span className="theme-when-light grid place-items-center">
        <MaterialSymbol className="size-5" name="dark_mode" />
        <span className="sr-only">ダークテーマに切り替える</span>
      </span>
    </button>
  )
}
