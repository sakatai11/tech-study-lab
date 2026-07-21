import Link from 'next/link'

import { DashboardShell } from '@/components/dashboard-shell'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TermCrumb } from '@/components/ui/term-crumb'
import { ReviewRunner } from '@/features/review/components/review-runner'
import { loadReview } from '@/features/review/server/load-review'

export const dynamic = 'force-dynamic'

export default async function ReviewPage() {
  const viewModel = await loadReview()

  return (
    <DashboardShell>
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
            <Badge className="border-red bg-red-bg text-red">{viewModel.dueCount} due</Badge>
          </div>
        </header>

        {viewModel.dueCount === 0 ? (
          <Card className="p-5 sm:p-7">
            <p className="m-0 font-mono text-xs font-bold text-green">queue: empty</p>
            <h2 className="mb-0 mt-3 text-2xl font-black text-ink">今日は復習済みです</h2>
            <p className="mb-0 mt-3 leading-7 text-ink-2">
              新しい教材を読んで問題に挑戦すると、SRS の復習キューが始まります。
            </p>
            <Link
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-green px-4 py-2.5 font-bold text-white shadow-[0_4px_0_var(--green-shade)] transition-transform hover:brightness-110 active:translate-y-1 active:shadow-none"
              href="/"
            >
              ホームへ
            </Link>
          </Card>
        ) : (
          <>
            <Card className="p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="m-0 text-lg font-black text-ink">due プレビュー</h2>
                  <p className="mb-0 mt-1 text-sm text-mute">
                    API の dueAt 順を保ったまま、コンテンツと Server loader で join しています。
                  </p>
                </div>
                <Badge className="border-purple bg-purple-bg text-purple">max 20</Badge>
              </div>
              <ul className="mt-5 grid gap-2 p-0">
                {viewModel.previews.map((preview) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-border bg-well px-4 py-3"
                    key={preview.questionId}
                  >
                    <span className="font-mono text-xs text-ink-2">{preview.questionId}</span>
                    <span className="font-mono text-xs text-red">
                      {preview.overdueDays > 0 ? `${preview.overdueDays}日滞留` : '今日 due'}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <ReviewRunner viewModel={viewModel} />
          </>
        )}
      </div>
    </DashboardShell>
  )
}
