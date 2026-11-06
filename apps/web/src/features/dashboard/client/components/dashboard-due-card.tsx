import Link from 'next/link'

import { Card } from '@/components/ui/card'
import { MaterialSymbol } from '@/components/ui/material-symbol'

const reviewLinkClassName =
  'mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green px-4 py-2.5 font-bold text-white shadow-[0_4px_0_var(--green-shade)] transition-transform hover:brightness-110 active:translate-y-1 active:shadow-none'

/** ダッシュボードの due 件数カード。件数を取得できなかった場合（null）も復習導線は出す。 */
export function DashboardDueCard({ dueCount }: { dueCount: number | null }) {
  if (dueCount === null) {
    return (
      <Card className="reveal border-blue p-5 sm:p-6">
        <p className="m-0 font-mono text-xs font-bold uppercase tracking-[0.18em] text-blue">
          today / review
        </p>
        <h2 className="mb-0 mt-3 text-2xl font-black text-ink">今日の復習</h2>
        <p className="mb-0 mt-2 text-pretty text-sm leading-6 text-mute">
          復習件数を取得できませんでした。復習ページから復習する問題を確認できます。
        </p>
        <Link className={reviewLinkClassName} href="/review">
          復習を始める
          <MaterialSymbol className="size-5" name="arrow_forward" />
        </Link>
      </Card>
    )
  }

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
        {dueCount}
        <span className="ml-1 text-sm text-mute">問</span>
      </p>
      {dueCount > 0 ? (
        <Link className={reviewLinkClassName} href="/review">
          復習を始める
          <MaterialSymbol className="size-5" name="arrow_forward" />
        </Link>
      ) : (
        <p className="mb-0 mt-5 text-sm text-mute">今は復習する問題はありません。</p>
      )}
    </Card>
  )
}
