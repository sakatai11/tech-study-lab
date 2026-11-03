import Link from 'next/link'
import type { ReactNode } from 'react'

import { ThemeToggle } from '@/components/theme-toggle'
import { MaterialSymbol, type MaterialSymbolName } from '@/components/ui/material-symbol'

type NavigationItem = {
  desktopLabel: string
  hasDueBadge?: boolean
  mobileLabel?: string
  icon: MaterialSymbolName
  section: NavigationSection
}

export type NavigationSection = 'dashboard' | 'learn' | 'quiz' | 'review' | 'analytics' | 'tree'

type NavigationHrefs = Partial<Record<NavigationSection, string>>

const navigation: NavigationItem[] = [
  {
    desktopLabel: 'ホーム',
    icon: 'home',
    mobileLabel: 'ホーム',
    section: 'dashboard',
  },
  { desktopLabel: '教材', icon: 'menu_book', mobileLabel: '教材', section: 'learn' },
  { desktopLabel: '演習', icon: 'contract_edit', mobileLabel: '演習', section: 'quiz' },
  {
    desktopLabel: '復習',
    hasDueBadge: true,
    icon: 'event_repeat',
    mobileLabel: '復習',
    section: 'review',
  },
  { desktopLabel: '学習分析', icon: 'bar_chart', section: 'analytics' },
  { desktopLabel: '学習領域', icon: 'category', mobileLabel: '領域', section: 'tree' },
]

function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-10 place-items-center rounded-xl bg-green text-lg font-black text-white shadow-[0_4px_0_var(--green-shade)]">
        ›_
      </span>
      <div className="min-w-0">
        <p className="m-0 text-balance font-black text-ink">tech-study-lab</p>
        <p className="m-0 hidden font-mono text-[11px] text-faint lg:block">dev-native workspace</p>
      </div>
    </div>
  )
}

function NavigationLabel({ item }: { item: NavigationItem }) {
  if (!item.mobileLabel || item.mobileLabel === item.desktopLabel) {
    return <span className="text-[11px] lg:text-base">{item.desktopLabel}</span>
  }

  return (
    <>
      <span className="text-[11px] lg:hidden">{item.mobileLabel}</span>
      <span className="hidden lg:inline">{item.desktopLabel}</span>
    </>
  )
}

function NavigationContent({
  isAvailable,
  item,
  reviewBadge,
}: {
  isAvailable: boolean
  item: NavigationItem
  reviewBadge?: ReactNode
}) {
  return (
    <>
      <MaterialSymbol className="lg:size-5" name={item.icon} />
      <NavigationLabel item={item} />
      {item.hasDueBadge ? reviewBadge : null}
      {!isAvailable ? (
        <span className="ml-auto hidden font-mono text-[10px] lg:inline">準備中</span>
      ) : null}
    </>
  )
}

// SP はボトムタブ、PC はサイドバーとして表示する。同じナビを2回描画しないことで、
// 全画面の RSC / SSR の CPU を減らす（Issue #220）。
const navigationItemClassName =
  'relative min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg font-semibold lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:border-2 lg:px-3 lg:text-left'

function Navigation({
  currentNavigation,
  navigationHrefs,
  reviewBadge,
}: {
  currentNavigation: NavigationSection
  navigationHrefs: NavigationHrefs
  reviewBadge?: ReactNode
}) {
  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t-2 border-border bg-surface px-1.5 pb-[calc(0.625rem_+_env(safe-area-inset-bottom))] pt-2 lg:static lg:z-auto lg:mt-4 lg:flex-col lg:gap-1.5 lg:border-t-0 lg:bg-transparent lg:p-0"
    >
      {navigation.map((item) => {
        const href = navigationHrefs[item.section]
        const isCurrent = item.section === currentNavigation
        const display = item.mobileLabel ? 'flex' : 'hidden lg:flex'

        return href ? (
          <Link
            aria-current={isCurrent ? 'page' : undefined}
            className={`${display} ${navigationItemClassName} ${
              isCurrent
                ? 'text-blue lg:border-blue lg:bg-blue-bg lg:font-bold'
                : 'text-mute lg:border-transparent lg:transition-colors lg:hover:border-border lg:hover:bg-bg lg:hover:text-ink'
            }`}
            href={href}
            key={item.section}
          >
            <NavigationContent isAvailable item={item} reviewBadge={reviewBadge} />
          </Link>
        ) : (
          <button
            className={`${display} ${navigationItemClassName} cursor-not-allowed text-faint opacity-70 lg:border-transparent`}
            disabled
            key={item.section}
            type="button"
          >
            <NavigationContent isAvailable={false} item={item} reviewBadge={reviewBadge} />
          </button>
        )
      })}
    </nav>
  )
}

export function DashboardShell({
  children,
  currentNavigation,
  navigationHrefs,
  reviewBadge,
  streakBadge,
}: {
  children: ReactNode
  currentNavigation: NavigationSection
  navigationHrefs: NavigationHrefs
  reviewBadge?: ReactNode
  /** SP のアプリバーにだけ表示する。PC では描画しない前提の部品を渡す。 */
  streakBadge?: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-bg">
      <div className="lg:mx-auto lg:flex lg:max-w-7xl lg:gap-5 lg:p-5">
        {/* SP では子要素をそのまま並べ（上部アプリバーと下部タブ）、PC ではサイドバーのカードにする。 */}
        <div className="contents lg:sticky lg:top-5 lg:flex lg:max-h-[calc(100dvh-2.5rem)] lg:min-h-[36rem] lg:w-60 lg:shrink-0 lg:flex-col lg:self-start lg:rounded-2xl lg:border-2 lg:border-border lg:bg-surface lg:p-4">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-bg px-4 py-3 lg:static lg:z-auto lg:gap-3 lg:border-b-2 lg:border-border lg:bg-transparent lg:px-0 lg:pb-5 lg:pt-0">
            <Brand />
            {streakBadge}
            <ThemeToggle />
          </header>
          <Navigation
            currentNavigation={currentNavigation}
            navigationHrefs={navigationHrefs}
            reviewBadge={reviewBadge}
          />
        </div>
        <main className="min-w-0 px-4 pb-28 pt-4 lg:flex-1 lg:p-0">{children}</main>
      </div>
    </div>
  )
}
