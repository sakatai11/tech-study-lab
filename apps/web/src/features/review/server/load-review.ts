import 'server-only'

import { cache } from 'react'

import { createServerApiClient } from '@/lib/api'
import { getBundledQuestions } from '@/lib/content'

import { fetchReviewQueue } from '../api/review-api'
import { reviewQueueToViewModel } from '../mapper'
import type { ReviewViewModel } from '../view-model'

async function loadReview(now?: number): Promise<ReviewViewModel> {
  const queue = await fetchReviewQueue(await createServerApiClient())
  return reviewQueueToViewModel(queue, getBundledQuestions(), now ?? Date.now())
}

/**
 * この feature の唯一の loader 入口。同一リクエスト内の queue 取得を1回に畳む。
 * due バッジと本文が同じ queue を参照する必要があるため、両者の
 * API 読み取りを同一リクエスト内で共有する（畳まないと件数と中身が食い違いうる）。
 * 畳み込み前の loadReview は export しない。型が同じで取り違えても気づけないため。
 * React の cache() はリクエストスコープであり、`user_id` を含められない
 * ユーザー横断の共有キャッシュではない（design.md 8.3）。
 */
export const loadReviewOnce = cache((): Promise<ReviewViewModel> => loadReview())
