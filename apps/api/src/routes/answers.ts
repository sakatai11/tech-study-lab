import { zValidator } from '@hono/zod-validator'
import {
  type AnswerResponse,
  type RateLimitUnavailableErrorResponse,
  type RateLimitedErrorResponse,
  answerRequestSchema,
} from '@tsl/shared'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'

import { createAnswerDeps } from '../dal/answer-repository'
import type { AppEnv } from '../env'
import { logPersistentWriteEvent } from '../persistent-write-observability'
import {
  type PlatformRateLimiter,
  checkPersistentWriteRateLimit,
  persistentWriteRateLimits,
} from '../persistent-write-rate-limit'
import { submitAnswer } from '../services/answer-service'

type AnswersRouteOptions = {
  rateLimiter?: PlatformRateLimiter
}

export function createAnswersRoute({ rateLimiter }: AnswersRouteOptions = {}) {
  return new Hono<AppEnv>().post('/', zValidator('json', answerRequestSchema), async (c) => {
    const rateLimit = persistentWriteRateLimits.answers
    const rateLimitResult = await checkPersistentWriteRateLimit(
      rateLimiter ?? c.env.ANSWERS_RATE_LIMITER,
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
    const result = await submitAnswer(createAnswerDeps(drizzle(c.env.DB)), {
      userId: c.get('userId'),
      questionId: input.questionId,
      selectedIndex: input.selectedIndex,
      responseTimeMs: input.responseTimeMs,
      now: Date.now(),
    })

    logPersistentWriteEvent('persistent_write_succeeded', rateLimit)
    return c.json(result satisfies AnswerResponse)
  })
}

export const answersRoute = createAnswersRoute()
