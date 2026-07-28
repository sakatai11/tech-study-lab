import 'server-only'

import type { ReactNode } from 'react'

import { TermCrumb } from '@/components/ui/term-crumb'

/**
 * API に依存しない静的シェル（design.md 7.1・9.2）。
 * Cache Components 有効時はここまでが queue 取得を待たずに返る。
 * ユーザー固有データを受け取らないこと（共有される静的シェルへの混入を防ぐ）。
 */
export function ReviewPageShell({
  children,
  dueBadge,
}: {
  children: ReactNode
  dueBadge: ReactNode
}) {
  return (
    <div className="flex flex-col gap-5">
      <header className="px-1 pt-1">
        <TermCrumb command="review queue --due-first --limit=20" />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-0 font-mono text-xs font-bold uppercase tracking-[0.18em] text-blue">
              review / queue
            </p>
            <h1 className="mb-0 mt-2 text-3xl font-black text-ink sm:text-4xl">今日の復習</h1>
          </div>
          {dueBadge}
        </div>
      </header>
      {children}
    </div>
  )
}
