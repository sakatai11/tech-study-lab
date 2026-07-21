import { zValidator } from '@hono/zod-validator'
import { type AnswerResponse, answerRequestSchema } from '@tsl/shared'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'

import { createAnswerDeps } from '../dal/answer-repository'
import type { AppEnv } from '../env'
import { submitAnswer } from '../services/answer-service'

export const answersRoute = new Hono<AppEnv>().post(
  '/',
  zValidator('json', answerRequestSchema),
  async (c) => {
    const input = c.req.valid('json')
    const result = await submitAnswer(createAnswerDeps(drizzle(c.env.DB)), {
      userId: c.get('userId'),
      questionId: input.questionId,
      selectedIndex: input.selectedIndex,
      responseTimeMs: input.responseTimeMs,
      now: Date.now(),
    })

    return c.json(result satisfies AnswerResponse)
  },
)
