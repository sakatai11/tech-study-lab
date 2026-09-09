import 'server-only'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { Suspense } from 'react'

import { Card } from '@/components/ui/card'
import { TermCrumb } from '@/components/ui/term-crumb'

import { loadDashboardStatic } from '../load-dashboard'
import { DashboardDueCard } from './dashboard-due-card'
import { DashboardDueCardFallback } from './dashboard-due-card-fallback'
import { DashboardFallback } from './dashboard-fallback'
import { DashboardUserContent } from './dashboard-user-content'

function revealStyle(index: number): CSSProperties {
  return { '--reveal-index': index } as CSSProperties
}

export function DashboardPageContent() {
  const { continueHref, continueTitle, continueEstimatedMinutes, continueQuestionCount } =
    loadDashboardStatic()

  return (
    <div className="flex flex-col gap-5">
      <section
        className="reveal flex flex-wrap items-start justify-between gap-4 px-1 pt-1"
        style={revealStyle(0)}
      >
        <div>
          <TermCrumb command="status" />
          <h1 className="mb-0 mt-2 text-balance text-3xl font-black text-ink sm:text-4xl">
            開発者のための学習ワークベンチ
          </h1>
          <p className="mb-0 mt-2 max-w-2xl text-pretty text-mute">
            今日の復習を片付けてから、新しい教材へ進みましょう。
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-green px-4 py-2.5 font-bold text-white shadow-[0_4px_0_var(--green-shade)] transition-transform hover:brightness-110 active:translate-y-1 active:shadow-none"
          href="/review"
        >
          復習を始める
        </Link>
      </section>

      <section aria-label="今日の復習" className="grid grid-cols-1 gap-3">
        <Suspense fallback={<DashboardDueCardFallback />}>
          <DashboardDueCard />
        </Suspense>
      </section>

      <Suspense fallback={<DashboardFallback />}>
        <DashboardUserContent />
      </Suspense>

      <Card className="reveal border-green p-5 sm:p-6" style={revealStyle(2)}>
        <div className="flex flex-wrap items-center gap-4">
          <span
            aria-hidden="true"
            className="grid size-12 place-items-center rounded-2xl bg-green-bg font-mono text-xl text-green"
          >
            ▤
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 font-mono text-xs font-bold text-green">NEXT LESSON</p>
            <h2 className="mb-0 mt-1 text-balance text-xl font-black text-ink">
              {continueTitle ?? '次のレッスン'}
            </h2>
            <p className="mb-0 mt-1 text-pretty text-sm text-mute">
              {continueTitle
                ? `${continueEstimatedMinutes ?? 0}分 · ${continueQuestionCount ?? 0}問`
                : '現在 bundle されている先頭レッスンから学習を続けられます。'}
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-green px-4 py-2.5 font-bold text-white shadow-[0_4px_0_var(--green-shade)] transition-transform hover:brightness-110 active:translate-y-1 active:shadow-none"
            href={continueHref}
          >
            続きから
          </Link>
        </div>
      </Card>
    </div>
  )
}
