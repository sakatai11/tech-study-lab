import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'

import { db as schema } from '@tsl/shared'

import type { AnswerDeps } from '../services/answer-service'

export function createAnswerDeps(db: DrizzleD1Database): AnswerDeps {
  return {
    async findAnswerIndex(questionId) {
      const [question] = await db
        .select({ answerIndex: schema.questions.answerIndex })
        .from(schema.questions)
        .where(eq(schema.questions.questionId, questionId))
        .limit(1)

      return question?.answerIndex ?? null
    },

    async findSrsState(userId, questionId) {
      const [state] = await db
        .select({
          ease: schema.srsStates.ease,
          intervalDays: schema.srsStates.intervalDays,
          reps: schema.srsStates.reps,
          lapses: schema.srsStates.lapses,
        })
        .from(schema.srsStates)
        .where(
          and(eq(schema.srsStates.userId, userId), eq(schema.srsStates.questionId, questionId)),
        )
        .limit(1)

      return state ?? null
    },

    async recordAnswer(params) {
      await db.batch([
        db.insert(schema.answerLogs).values({
          id: crypto.randomUUID(),
          userId: params.userId,
          questionId: params.questionId,
          isCorrect: params.isCorrect,
          answeredAt: new Date(params.answeredAt),
          responseTimeMs: params.responseTimeMs,
        }),
        db
          .insert(schema.srsStates)
          .values({
            userId: params.userId,
            questionId: params.questionId,
            ease: params.nextSrs.ease,
            intervalDays: params.nextSrs.intervalDays,
            dueAt: new Date(params.nextSrs.dueAt),
            reps: params.nextSrs.reps,
            lapses: params.nextSrs.lapses,
          })
          .onConflictDoUpdate({
            target: [schema.srsStates.userId, schema.srsStates.questionId],
            set: {
              ease: params.nextSrs.ease,
              intervalDays: params.nextSrs.intervalDays,
              dueAt: new Date(params.nextSrs.dueAt),
              reps: params.nextSrs.reps,
              lapses: params.nextSrs.lapses,
            },
          }),
      ])
    },
  }
}
