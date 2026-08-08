import 'server-only'

import Link from 'next/link'

import { Card } from '@/components/ui/card'
import { ReviewRunner } from '@/features/review/client/components/review-runner'

import { loadReviewOnce } from '../load-review'

/**
 * ユーザー固有の due queue を読む非キャッシュの async Server Component。
 * <Suspense> の内側に置き、queue 完了後に空キュー・整合性エラー・ReviewRunner を分岐する
 * （design.md 9.2）。
 */
export async function ReviewUserContent() {
  const viewModel = await loadReviewOnce()

  if (viewModel.dueCount === 0) {
    if (viewModel.hasMore) {
      throw new Error('復習キューの整合性を確認できませんでした。')
    }

    return (
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
    )
  }

  return <ReviewRunner viewModel={viewModel} />
}
