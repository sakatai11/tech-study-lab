import { type ReviewQueueResponse, reviewQueueResponseSchema } from '@tsl/shared'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'

import { createReviewDeps } from '../dal/review-repository'
import type { AppEnv } from '../env'
import { getReviewQueue } from '../services/review-service'

export const reviewRoute = new Hono<AppEnv>().get('/queue', async (c) => {
  const result = await getReviewQueue(createReviewDeps(drizzle(c.env.DB)), {
    userId: c.get('userId'),
    now: Date.now(),
  })

  return c.json(result satisfies ReviewQueueResponse)
})
