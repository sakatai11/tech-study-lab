'use client'

import { useCallback, useMemo } from 'react'

import { createBrowserApiClient } from '@/lib/api'
import { type ClientQueryResult, useClientQuery } from '@/lib/use-client-query'

import { fetchReviewQueue } from '../../api/review-api'
import { reviewQueueToViewModel } from '../../mapper'
import type { ReviewQuestionIndexEntry, ReviewViewModel } from '../../view-model'

/**
 * 復習 queue をブラウザで取得し、静的な page から受け取った問題索引と結合する。
 * 解答ごとの無効化通知では取得し直さない。バッチの途中で問題が差し替わるため、
 * 再取得はバッチ完了時の reload だけで行う。バッチの整合性のため、タブ内に保持せず
 * 画面を開くたびに取得する（ADR-0019）。
 */
export function useReviewQueue(
  index: readonly ReviewQuestionIndexEntry[],
): ClientQueryResult<ReviewViewModel> {
  const questions = useMemo(() => new Map(index.map((entry) => [entry.id, entry])), [index])
  const load = useCallback(
    async () =>
      reviewQueueToViewModel(
        await fetchReviewQueue(createBrowserApiClient()),
        questions,
        Date.now(),
      ),
    [questions],
  )

  return useClientQuery(load)
}
