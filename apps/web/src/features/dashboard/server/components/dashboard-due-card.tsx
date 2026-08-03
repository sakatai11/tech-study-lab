import 'server-only'

import Link from 'next/link'

import { Card } from '@/components/ui/card'

import { loadDashboardDueCount } from '../load-dashboard'

const reviewLinkClassName =
  'mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-green px-4 py-2.5 font-bold text-white shadow-[0_4px_0_var(--green-shade)] transition-transform hover:brightness-110 active:translate-y-1 active:shadow-none'

/** Suspense 内で due 件数だけを取得する、ダッシュボードのユーザー固有カード。 */
export async function DashboardDueCard() {
  try {
    const viewModel = await loadDashboardDueCount()

    return (
      <Card className="reveal border-blue p-5 sm:p-6">
        <p className="m-0 font-mono text-xs font-bold uppercase tracking-[0.18em] text-blue">
          today / review
        </p>
        <h2 className="mb-0 mt-3 text-2xl font-black text-ink">今日の復習</h2>
        <p className="mb-0 mt-2 text-pretty text-sm leading-6 text-mute">
          期限を迎えた問題を、忘れる前にもう一度解きましょう。
        </p>
        <p className="mb-0 mt-5 font-mono text-3xl font-black tabular-nums text-ink">
          {viewModel.dueCount}
          <span className="ml-1 text-sm text-mute">問 due</span>
        </p>
        <Link className={reviewLinkClassName} href="/review">
          復習を始める
        </Link>
      </Card>
    )
  } catch {
    // API 障害時も、静的シェルと復習導線は表示し続ける。
    return (
      <Card className="reveal border-blue p-5 sm:p-6">
        <p className="m-0 font-mono text-xs font-bold uppercase tracking-[0.18em] text-blue">
          today / review
        </p>
        <h2 className="mb-0 mt-3 text-2xl font-black text-ink">今日の復習</h2>
        <p className="mb-0 mt-2 text-pretty text-sm leading-6 text-mute">
          復習件数を取得できませんでした。復習ページからキューを確認できます。
        </p>
        <Link className={reviewLinkClassName} href="/review">
          復習を始める
        </Link>
      </Card>
    )
  }
}
