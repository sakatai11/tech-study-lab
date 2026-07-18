import type { DueCountResponse } from '@tsl/shared'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'

import { createReviewDeps } from '../dal/review-repository'
import type { AppEnv } from '../env'
import { getDueCount } from '../services/review-service'

export const dashboardRoute = new Hono<AppEnv>().get('/due-count', async (c) => {
  const result = await getDueCount(createReviewDeps(drizzle(c.env.DB)), {
    userId: c.get('userId'),
    now: Date.now(),
  })

  return c.json(result satisfies DueCountResponse)
})
