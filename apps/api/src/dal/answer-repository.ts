import { and, eq, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'

import { db as schema } from '@tsl/shared'

import type { AnswerDeps } from '../services/answer-service'
import { SrsConflictError } from '../services/errors'

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
          version: schema.srsStates.version,
        })
        .from(schema.srsStates)
        .where(
          and(eq(schema.srsStates.userId, userId), eq(schema.srsStates.questionId, questionId)),
        )
        .limit(1)

      return state ?? null
    },

    async recordAnswer(params) {
      const nextVersion = params.expectedVersion + 1
      const [srsResult] = await db.batch([
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
            version: nextVersion,
          })
          .onConflictDoUpdate({
            target: [schema.srsStates.userId, schema.srsStates.questionId],
            set: {
              ease: params.nextSrs.ease,
              intervalDays: params.nextSrs.intervalDays,
              dueAt: new Date(params.nextSrs.dueAt),
              reps: params.nextSrs.reps,
              lapses: params.nextSrs.lapses,
              version: nextVersion,
            },
            setWhere: eq(schema.srsStates.version, params.expectedVersion),
          }),
        db.insert(schema.answerLogs).select(
          db
            .select({
              id: sql<string>`${crypto.randomUUID()}`.as('id'),
              userId: sql<string>`${params.userId}`.as('user_id'),
              questionId: sql<string>`${params.questionId}`.as('question_id'),
              isCorrect: sql<number>`${params.isCorrect ? 1 : 0}`.as('is_correct'),
              answeredAt: sql<number>`${params.answeredAt}`.as('answered_at'),
              responseTimeMs: sql<number | null>`${params.responseTimeMs ?? null}`.as(
                'response_time_ms',
              ),
            })
            .from(schema.srsStates)
            .where(
              and(
                eq(schema.srsStates.userId, params.userId),
                eq(schema.srsStates.questionId, params.questionId),
                eq(schema.srsStates.version, nextVersion),
              ),
            ),
        ),
      ])

      const changes = (srsResult as { meta?: { changes?: number } } | undefined)?.meta?.changes
      if (changes !== 1) {
        throw new SrsConflictError(params.userId, params.questionId)
      }
    },
  }
}
