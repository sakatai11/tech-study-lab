import { type ReviewQueueResponse, reviewQueueResponseSchema } from '@tsl/shared'

import type { ApiClient } from '@/lib/api'
import { requestJson } from '@/lib/api-response'

export async function fetchReviewQueue(client: ApiClient): Promise<ReviewQueueResponse> {
  const response = await requestJson(
    () => client.review.queue.$get(),
    '復習キューの取得に失敗しました。',
  )

  return reviewQueueResponseSchema.parse(response)
}
