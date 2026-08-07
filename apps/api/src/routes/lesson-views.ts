import { zValidator } from '@hono/zod-validator'
import { type LessonViewResponse, lessonViewRequestSchema } from '@tsl/shared'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'

import { createLessonViewDeps } from '../dal/lesson-view-repository'
import type { AppEnv } from '../env'
import { recordLessonView } from '../services/lesson-view-service'

export const lessonViewsRoute = new Hono<AppEnv>().post(
  '/',
  zValidator('json', lessonViewRequestSchema),
  async (c) => {
    const input = c.req.valid('json')
    await recordLessonView(createLessonViewDeps(drizzle(c.env.DB)), {
      userId: c.get('userId'),
      lessonId: input.lessonId,
      now: Date.now(),
    })

    return c.json({ recorded: true } satisfies LessonViewResponse, 201)
  },
)
