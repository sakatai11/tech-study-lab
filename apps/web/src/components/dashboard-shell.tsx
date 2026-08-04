import Link from 'next/link'
import type { ReactNode } from 'react'

import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'

type NavigationItem = {
  desktopLabel: string
  hasDueBadge?: boolean
  mobileLabel?: string
  section: NavigationSection
  symbol: string
}

export type NavigationSection = 'dashboard' | 'learn' | 'quiz' | 'review' | 'analytics' | 'tree'

type NavigationHrefs = Partial<Record<NavigationSection, string>>

const desktopNavigation: NavigationItem[] = [
  {
    desktopLabel: 'ダッシュボード',
    mobileLabel: 'ホーム',
    section: 'dashboard',
    symbol: '▦',
  },
  { desktopLabel: '教材', mobileLabel: '教材', section: 'learn', symbol: '▤' },
  { desktopLabel: '演習', mobileLabel: '演習', section: 'quiz', symbol: '✎' },
  {
    desktopLabel: '復習',
    hasDueBadge: true,
    mobileLabel: '復習',
    section: 'review',
    symbol: '↻',
  },
  { desktopLabel: 'アナリティクス', section: 'analytics', symbol: '▥' },
  { desktopLabel: 'スキルツリー', mobileLabel: 'ツリー', section: 'tree', symbol: '⌘' },
]

const mobileNavigation = desktopNavigation.filter((item) => item.mobileLabel)

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-10 place-items-center rounded-xl bg-green text-lg font-black text-white shadow-[0_4px_0_var(--green-shade)]">
        ›_
      </span>
      <div className="min-w-0">
        <p className="m-0 text-balance font-black text-ink">tech-study-lab</p>
        {!compact ? (
          <p className="m-0 font-mono text-[11px] text-faint">dev-native workspace</p>
        ) : null}
      </div>
    </div>
  )
}

function DesktopNavigationContent({
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
      <span aria-hidden="true" className="grid size-5 place-items-center font-mono">
        {item.symbol}
      </span>
      {item.desktopLabel}
      {item.hasDueBadge ? reviewBadge : null}
      {!isAvailable ? <span className="ml-auto font-mono text-[10px]">準備中</span> : null}
    </>
  )
}

function MobileNavigationContent({
  item,
  reviewBadge,
}: {
  item: NavigationItem
  reviewBadge?: ReactNode
}) {
  return (
    <>
      <span aria-hidden="true" className="font-mono text-base">
        {item.symbol}
      </span>
      <span className="text-[11px]">{item.mobileLabel}</span>
      {item.hasDueBadge ? reviewBadge : null}
    </>
  )
}

function DesktopNavigation({
  currentNavigation,
  navigationHrefs,
  reviewBadge,
}: {
  currentNavigation: NavigationSection
  navigationHrefs: NavigationHrefs
  reviewBadge?: ReactNode
}) {
  return (
    <aside className="sticky top-5 hidden w-60 shrink-0 self-start lg:block">
      <Card className="flex max-h-[calc(100dvh-2.5rem)] min-h-[36rem] flex-col p-4">
        <div className="flex items-center justify-between gap-3 border-b-2 border-border pb-5">
          <Brand />
          <ThemeToggle />
        </div>
        <nav aria-label="メインナビゲーション" className="mt-4 flex flex-col gap-1.5">
          {desktopNavigation.map((item) => {
            const href = navigationHrefs[item.section]
            const isCurrent = item.section === currentNavigation

            return href ? (
              <Link
                aria-current={isCurrent ? 'page' : undefined}
                className={
                  isCurrent
                    ? 'flex min-h-11 items-center gap-3 rounded-xl border-2 border-blue bg-blue-bg px-3 text-left font-bold text-blue'
                    : 'flex min-h-11 items-center gap-3 rounded-xl border-2 border-transparent px-3 text-left font-semibold text-mute transition-colors hover:border-border hover:bg-bg hover:text-ink'
                }
                href={href}
                key={item.desktopLabel}
              >
                <DesktopNavigationContent isAvailable item={item} reviewBadge={reviewBadge} />
              </Link>
            ) : (
              <button
                className="flex min-h-11 cursor-not-allowed items-center gap-3 rounded-xl border-2 border-transparent px-3 text-left font-semibold text-faint opacity-70"
                disabled
                key={item.desktopLabel}
                type="button"
              >
                <DesktopNavigationContent
                  isAvailable={false}
                  item={item}
                  reviewBadge={reviewBadge}
                />
              </button>
            )
          })}
        </nav>
        <div className="mt-auto border-t-2 border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-ink">学習データ</span>
            <Badge className="border-purple bg-purple-bg text-purple">sample</Badge>
          </div>
          <ProgressBar className="mt-3" color="purple" label="基盤実装の進捗" value={35} />
          <p className="mb-0 mt-2 font-mono text-xs text-faint">foundation: 35%</p>
        </div>
      </Card>
    </aside>
  )
}

function MobileHeader() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-bg px-4 py-3 lg:hidden">
      <Brand compact />
      <Badge className="shrink-0 border-orange bg-orange-bg font-sans text-xs text-orange">
        🔥 <span className="tabular-nums">12日</span>
      </Badge>
      <ThemeToggle />
    </header>
  )
}

function MobileNavigation({
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
      aria-label="モバイルナビゲーション"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t-2 border-border bg-surface px-1.5 pb-[calc(0.625rem_+_env(safe-area-inset-bottom))] pt-2 lg:hidden"
    >
      {mobileNavigation.map((item) => {
        const href = navigationHrefs[item.section]
        const isCurrent = item.section === currentNavigation

        return href ? (
          <Link
            aria-current={isCurrent ? 'page' : undefined}
            className={
              isCurrent
                ? 'relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg font-semibold text-blue'
                : 'relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg font-semibold text-mute'
            }
            href={href}
            key={item.desktopLabel}
          >
            <MobileNavigationContent item={item} reviewBadge={reviewBadge} />
          </Link>
        ) : (
          <button
            className="relative flex min-h-11 flex-1 cursor-not-allowed flex-col items-center justify-center gap-0.5 rounded-lg font-semibold text-faint opacity-70"
            disabled
            key={item.desktopLabel}
            type="button"
          >
            <MobileNavigationContent item={item} reviewBadge={reviewBadge} />
          </button>
        )
      })}
    </nav>
  )
}

export function DashboardShell({
  children,
  currentNavigation,
  desktopReviewBadge,
  mobileReviewBadge,
  navigationHrefs,
}: {
  children: ReactNode
  currentNavigation: NavigationSection
  desktopReviewBadge?: ReactNode
  mobileReviewBadge?: ReactNode
  navigationHrefs: NavigationHrefs
}) {
  return (
    <div className="min-h-dvh bg-bg">
      <MobileHeader />
      <div className="mx-auto flex max-w-7xl gap-5 px-4 pb-28 pt-4 lg:px-5 lg:pb-5 lg:pt-5">
        <DesktopNavigation
          currentNavigation={currentNavigation}
          navigationHrefs={navigationHrefs}
          reviewBadge={desktopReviewBadge}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <MobileNavigation
        currentNavigation={currentNavigation}
        navigationHrefs={navigationHrefs}
        reviewBadge={mobileReviewBadge}
      />
    </div>
  )
}
