'use client'

import Link from 'next/link'

import { Card } from '@/components/ui/card'
import { LoadErrorCard, LoadingCard } from '@/components/ui/load-state'
import { MaterialSymbol } from '@/components/ui/material-symbol'

import { useReviewQueueContext } from './review-queue-provider'
import { ReviewRunner } from './review-runner'

const reviewErrorProps = {
  code: 'review_unavailable',
  title: '復習データを読み込めませんでした',
  message:
    '一時的な通信の問題、または保存された復習データと教材コンテンツとの不整合が発生している可能性があります。再読み込みを試すか、ホームへ戻ってください。',
  links: [{ href: '/home', label: 'ホームへ' }],
} as const

/**
 * ユーザー固有の due queue をブラウザで取得して表示する（ADR-0019）。
 * 通信の失敗と content の不整合は、どちらも同じ案内で再試行とホームへの導線を出す。
 */
export function ReviewUserContent() {
  const queue = useReviewQueueContext()

  if (queue.status === 'loading') return <LoadingCard label="復習する問題を読み込んでいます" />
  // 表示できる問題が0件なのに次のバッチがあるのは、content との不整合である（design.md 5.3）。
  if (queue.status === 'error' || (queue.data.dueCount === 0 && queue.data.hasMore)) {
    return <LoadErrorCard {...reviewErrorProps} onRetry={queue.reload} />
  }

  if (queue.data.dueCount === 0) {
    return (
      <Card className="p-5 sm:p-7">
        <p className="m-0 font-mono text-xs font-bold text-green">queue: empty</p>
        <h2 className="mb-0 mt-3 text-2xl font-black text-ink">今は復習する問題はありません</h2>
        <p className="mb-0 mt-3 leading-7 text-ink-2">
          期限を迎えた問題はありません。教材を読んで問題を解くと、正誤に応じて次に復習する日が決まります。
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green px-4 py-2.5 font-bold text-white shadow-[0_4px_0_var(--green-shade)] transition-transform hover:brightness-110 active:translate-y-1 active:shadow-none"
          href="/home"
        >
          <MaterialSymbol className="size-5" name="arrow_back" />
          ホームへ
        </Link>
      </Card>
    )
  }

  return <ReviewRunner onNextBatch={queue.reload} viewModel={queue.data} />
}
