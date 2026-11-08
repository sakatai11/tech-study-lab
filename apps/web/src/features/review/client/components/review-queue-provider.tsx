'use client'

import { type ReactNode, createContext, useContext } from 'react'

import type { ClientQueryResult } from '@/lib/use-client-query'

import type { ReviewQuestionIndexEntry, ReviewViewModel } from '../../view-model'
import { useReviewQueue } from '../hooks/use-review-queue'

const ReviewQueueContext = createContext<ClientQueryResult<ReviewViewModel> | null>(null)

/**
 * due バッジと本文が同じ queue を参照するよう、取得を1回にまとめて共有する（ADR-0019）。
 */
export function ReviewQueueProvider({
  children,
  index,
}: {
  children: ReactNode
  index: readonly ReviewQuestionIndexEntry[]
}) {
  const queue = useReviewQueue(index)

  return <ReviewQueueContext.Provider value={queue}>{children}</ReviewQueueContext.Provider>
}

export function useReviewQueueContext(): ClientQueryResult<ReviewViewModel> {
  const queue = useContext(ReviewQueueContext)
  if (!queue) throw new Error('ReviewQueueProvider is missing')
  return queue
}
