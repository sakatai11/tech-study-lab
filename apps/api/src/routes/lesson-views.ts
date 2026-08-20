import { zValidator } from '@hono/zod-validator'
import { type LessonViewResponse, lessonViewRequestSchema } from '@tsl/shared'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'

import { createLessonViewDeps } from '../dal/lesson-view-repository'
import type { AppEnv } from '../env'
import { logPersistentWriteEvent } from '../persistent-write-observability'
import { type PlatformRateLimiter, persistentWriteRateLimits } from '../persistent-write-rate-limit'
import { guardPersistentWriteRateLimit } from '../persistent-write-rate-limit-guard'
import { recordLessonView } from '../services/lesson-view-service'

type LessonViewsRouteOptions = {
  rateLimiter?: PlatformRateLimiter
}

export function createLessonViewsRoute({ rateLimiter }: LessonViewsRouteOptions = {}) {
  return new Hono<AppEnv>().post('/', zValidator('json', lessonViewRequestSchema), async (c) => {
    const rateLimit = persistentWriteRateLimits.lessonViews
    const rateLimitResponse = await guardPersistentWriteRateLimit(
      c,
      rateLimit,
      rateLimiter ?? c.env.LESSON_VIEWS_RATE_LIMITER,
    )

    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const input = c.req.valid('json')
    await recordLessonView(createLessonViewDeps(drizzle(c.env.DB)), {
      userId: c.get('userId'),
      lessonId: input.lessonId,
      now: Date.now(),
    })

    logPersistentWriteEvent('persistent_write_succeeded', rateLimit)
    return c.json({ recorded: true } satisfies LessonViewResponse, 201)
  })
}
