import { zValidator } from '@hono/zod-validator'
import { type AnswerResponse, answerRequestSchema } from '@tsl/shared'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'

import { createAnswerDeps } from '../dal/answer-repository'
import type { AppEnv } from '../env'
import { logPersistentWriteEvent } from '../persistent-write-observability'
import { type PlatformRateLimiter, persistentWriteRateLimits } from '../persistent-write-rate-limit'
import { guardPersistentWriteRateLimit } from '../persistent-write-rate-limit-guard'
import { submitAnswer } from '../services/answer-service'

type AnswersRouteOptions = {
  rateLimiter?: PlatformRateLimiter
}

export function createAnswersRoute({ rateLimiter }: AnswersRouteOptions = {}) {
  return new Hono<AppEnv>().post('/', zValidator('json', answerRequestSchema), async (c) => {
    const rateLimit = persistentWriteRateLimits.answers
    const rateLimitResponse = await guardPersistentWriteRateLimit(
      c,
      rateLimit,
      rateLimiter ?? c.env.ANSWERS_RATE_LIMITER,
    )

    if (rateLimitResponse) {
      return rateLimitResponse
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
