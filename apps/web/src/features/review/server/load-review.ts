import 'server-only'

import { connection } from 'next/server'
import { cache } from 'react'

import { createServerApiClient } from '@/lib/api'
import { getBundledQuestions } from '@/lib/content'

import { fetchReviewQueue } from '../api/review-api'
import { reviewQueueToViewModel } from '../mapper'
import type { ReviewViewModel } from '../view-model'

export async function loadReview(now?: number): Promise<ReviewViewModel> {
  // Cache Components 有効時、この loader はリクエスト時にしか実行できない。
  // connection() で動的レンダリングを宣言してから、Cloudflare context の解決と
  // 現在時刻の読み取りを行う（どちらも prerender 中は許されない）。
  await connection()

  const queue = await fetchReviewQueue(await createServerApiClient())
  return reviewQueueToViewModel(queue, getBundledQuestions(), now ?? Date.now())
}

/**
 * 同一リクエスト内の loadReview() を1回に畳む。静的シェルが due バッジと本文を
 * 別々の <Suspense> 境界へ分けるため、両者が同じ queue を参照する必要がある。
 * React の cache() はリクエストスコープであり、`user_id` を含められない
 * ユーザー横断の共有キャッシュ（`'use cache'` 等）ではない（design.md 8.3）。
 */
export const loadReviewOnce = cache((): Promise<ReviewViewModel> => loadReview())
