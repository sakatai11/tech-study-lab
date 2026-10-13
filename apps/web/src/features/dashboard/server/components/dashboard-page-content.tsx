import 'server-only'

import Link from 'next/link'
import type { CSSProperties } from 'react'

import { Card } from '@/components/ui/card'
import { MaterialSymbol } from '@/components/ui/material-symbol'
import { TermCrumb } from '@/components/ui/term-crumb'

import { loadDashboardStatic } from '../load-dashboard'
import { DashboardDueCard } from './dashboard-due-card'
import { DashboardUserContent } from './dashboard-user-content'

function revealStyle(index: number): CSSProperties {
  return { '--reveal-index': index } as CSSProperties
}

export async function DashboardPageContent() {
  const {
    continueHref,
    continueTitle,
    continueEstimatedMinutes,
    continueQuestionCount,
    learnHref,
  } = loadDashboardStatic()
  const [dueCard, userContent] = await Promise.all([DashboardDueCard(), DashboardUserContent()])

  return (
    <div className="flex flex-col gap-5">
      <section className="reveal px-1 pt-1" style={revealStyle(0)}>
        <div>
          <TermCrumb command="status" />
          <h1 className="mb-0 mt-2 text-balance text-3xl font-black text-ink sm:text-4xl">
            今日の学習
          </h1>
          <p className="mb-0 mt-2 max-w-2xl text-pretty text-mute">
            今日の復習を片付けてから、新しい教材へ進みましょう。
          </p>
        </div>
      </section>

      <section aria-label="今日の復習" className="grid grid-cols-1 gap-3">
        {dueCard}
      </section>

      {userContent}

      {learnHref ? (
        <Card className="reveal border-green p-5 sm:p-6" style={revealStyle(2)}>
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-green-bg text-green">
              <MaterialSymbol className="size-7" name="menu_book" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 font-mono text-xs font-bold text-green">LESSON</p>
              <h2 className="mb-0 mt-1 text-balance text-xl font-black text-ink">
                {continueTitle ?? '次のレッスン'}
              </h2>
              <p className="mb-0 mt-1 text-pretty text-sm text-mute">
                {continueTitle
                  ? `${continueEstimatedMinutes ?? 0}分 · ${continueQuestionCount ?? 0}問`
                  : '最初のレッスンから学習を始められます。'}
              </p>
            </div>
            <Link
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green px-4 py-2.5 font-bold text-white shadow-[0_4px_0_var(--green-shade)] transition-transform hover:brightness-110 active:translate-y-1 active:shadow-none"
              href={continueHref}
            >
              教材を読む
              <MaterialSymbol className="size-5" name="arrow_forward" />
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
