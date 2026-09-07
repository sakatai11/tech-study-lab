import { zValidator } from '@hono/zod-validator'
import {
  type AnalyticsSummaryResponse,
  type AnalyticsWeeklyResponse,
  type MistakesResponse,
  analyticsRequestSchema,
} from '@tsl/shared'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'

import { estimatedMinutesByLesson } from '../content-estimates'
import { createAnalyticsDeps } from '../dal/analytics-repository'
import type { AppEnv } from '../env'
import {
  getAnalyticsMistakes,
  getAnalyticsSummary,
  getAnalyticsWeekly,
} from '../services/analytics-service'

function analyticsDeps(c: { env: AppEnv['Bindings'] }) {
  return createAnalyticsDeps(drizzle(c.env.DB), { estimatedMinutesByLesson })
}

export const analyticsRoute = new Hono<AppEnv>()
  .get('/summary', zValidator('query', analyticsRequestSchema), async (c) => {
    const result = await getAnalyticsSummary(analyticsDeps(c), {
      userId: c.get('userId'),
      now: Date.now(),
    })

    return c.json(result satisfies AnalyticsSummaryResponse)
  })
  .get('/weekly', zValidator('query', analyticsRequestSchema), async (c) => {
    const result = await getAnalyticsWeekly(analyticsDeps(c), {
      userId: c.get('userId'),
      now: Date.now(),
    })

    return c.json(result satisfies AnalyticsWeeklyResponse)
  })
  .get('/mistakes', zValidator('query', analyticsRequestSchema), async (c) => {
    const result = await getAnalyticsMistakes(analyticsDeps(c), {
      userId: c.get('userId'),
    })

    return c.json(result satisfies MistakesResponse)
  })
