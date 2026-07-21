import { and, asc, count, eq, lte } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'

import { db as schema } from '@tsl/shared'

import type { ReviewDeps } from '../services/review-service'

const REVIEW_QUEUE_LIMIT = 20

export function createReviewDeps(db: DrizzleD1Database): ReviewDeps {
  return {
    async findDueQuestions(userId, now) {
      const states = await db
        .select({
          questionId: schema.srsStates.questionId,
          dueAt: schema.srsStates.dueAt,
        })
        .from(schema.srsStates)
        .where(and(eq(schema.srsStates.userId, userId), lte(schema.srsStates.dueAt, new Date(now))))
        .orderBy(asc(schema.srsStates.dueAt))
        .limit(REVIEW_QUEUE_LIMIT)

      return states.map((state) => ({
        questionId: state.questionId,
        dueAt: state.dueAt.getTime(),
      }))
    },

    async countDueQuestions(userId, now) {
      const [result] = await db
        .select({ dueCount: count() })
        .from(schema.srsStates)
        .where(and(eq(schema.srsStates.userId, userId), lte(schema.srsStates.dueAt, new Date(now))))

      return result?.dueCount ?? 0
    },
  }
}
