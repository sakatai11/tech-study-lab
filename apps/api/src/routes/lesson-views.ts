import { zValidator } from '@hono/zod-validator'
import {
  type LessonViewResponse,
  type RateLimitUnavailableErrorResponse,
  type RateLimitedErrorResponse,
  lessonViewRequestSchema,
} from '@tsl/shared'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'

import { createLessonViewDeps } from '../dal/lesson-view-repository'
import type { AppEnv } from '../env'
import { logPersistentWriteEvent } from '../persistent-write-observability'
import {
  type PlatformRateLimiter,
  checkPersistentWriteRateLimit,
  persistentWriteRateLimits,
} from '../persistent-write-rate-limit'
import { recordLessonView } from '../services/lesson-view-service'

type LessonViewsRouteOptions = {
  rateLimiter?: PlatformRateLimiter
}

export function createLessonViewsRoute({ rateLimiter }: LessonViewsRouteOptions = {}) {
  return new Hono<AppEnv>().post('/', zValidator('json', lessonViewRequestSchema), async (c) => {
    const rateLimit = persistentWriteRateLimits.lessonViews
    const rateLimitResult = await checkPersistentWriteRateLimit(
      rateLimiter ?? c.env.LESSON_VIEWS_RATE_LIMITER,
      c.get('userId'),
      rateLimit,
    )

    if (rateLimitResult === 'limited') {
      logPersistentWriteEvent('persistent_write_rate_limited', rateLimit)
      return c.json(
        {
          error: { code: 'RATE_LIMITED', message: 'Too Many Requests' },
        } satisfies RateLimitedErrorResponse,
        429,
        { 'Retry-After': '60' },
      )
    }

    if (rateLimitResult === 'unavailable') {
      logPersistentWriteEvent('persistent_write_rate_limit_unavailable', rateLimit)
      return c.json(
        {
          error: { code: 'RATE_LIMIT_UNAVAILABLE', message: 'Rate limit unavailable' },
        } satisfies RateLimitUnavailableErrorResponse,
        503,
      )
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

export const lessonViewsRoute = createLessonViewsRoute()
