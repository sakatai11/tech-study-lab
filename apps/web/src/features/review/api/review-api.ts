import 'server-only'

import { createClient } from '@tsl/api/client'
import { type ReviewQueueResponse, reviewQueueResponseSchema } from '@tsl/shared'

const apiBaseUrl =
  process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787'
const apiClient = createClient(apiBaseUrl)

export async function fetchReviewQueue(): Promise<ReviewQueueResponse> {
  const response = await apiClient.review.queue.$get()

  if (!response.ok) {
    throw new Error('復習キューの取得に失敗しました。')
  }

  return reviewQueueResponseSchema.parse(await response.json())
}
