import { zValidator } from '@hono/zod-validator'
import { type RecentActivityResponse, analyticsRequestSchema } from '@tsl/shared'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'

import { createActivityDeps } from '../dal/activity-repository'
import type { AppEnv } from '../env'
import { getRecentActivity } from '../services/activity-service'

export const activityRoute = new Hono<AppEnv>().get(
  '/recent',
  zValidator('query', analyticsRequestSchema),
  async (c) => {
    const result = await getRecentActivity(createActivityDeps(drizzle(c.env.DB)), {
      userId: c.get('userId'),
    })

    return c.json(result satisfies RecentActivityResponse)
  },
)
