import 'server-only'

import { createServerApiClient } from '@/lib/api'
import { getBundledQuestions } from '@/lib/content'

import { fetchReviewQueue } from '../api/review-api'
import { reviewQueueToViewModel } from '../mapper'
import type { ReviewViewModel } from '../view-model'

export async function loadReview(now = Date.now()): Promise<ReviewViewModel> {
  const queue = await fetchReviewQueue(await createServerApiClient())
  return reviewQueueToViewModel(queue, getBundledQuestions(), now)
}
