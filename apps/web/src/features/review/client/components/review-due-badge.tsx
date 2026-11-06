'use client'

import { Badge } from '@/components/ui/badge'

import { useReviewQueueContext } from './review-queue-provider'

/** 本文と同じ取得結果から、表示できる due 件数を出す。取得前と失敗時は出さない。 */
export function ReviewDueBadge() {
  const queue = useReviewQueueContext()
  if (queue.status !== 'success') return null

  return <Badge className="border-red bg-red-bg text-red">{queue.data.dueCount}問</Badge>
}
