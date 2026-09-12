import { asc, desc, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'

import { type RecentActivityItem, db as schema } from '@tsl/shared'

import type { ActivityDeps } from '../services/activity-service'

export function createActivityDeps(db: DrizzleD1Database): ActivityDeps {
  return {
    async findRecentActivity(userId, limit): Promise<RecentActivityItem[]> {
      const [answerRows, lessonViewRows] = await Promise.all([
        db
          .select({
            id: schema.answerLogs.id,
            occurredAt: schema.answerLogs.answeredAt,
            questionId: schema.answerLogs.questionId,
            lessonId: schema.questions.lessonId,
            isCorrect: schema.answerLogs.isCorrect,
          })
          .from(schema.answerLogs)
          .leftJoin(schema.questions, eq(schema.questions.questionId, schema.answerLogs.questionId))
          .where(eq(schema.answerLogs.userId, userId))
          .orderBy(desc(schema.answerLogs.answeredAt), asc(schema.answerLogs.id))
          .limit(limit),
        db
          .select({
            id: schema.lessonViews.id,
            occurredAt: schema.lessonViews.viewedAt,
            lessonId: schema.lessonViews.lessonId,
          })
          .from(schema.lessonViews)
          .where(eq(schema.lessonViews.userId, userId))
          .orderBy(desc(schema.lessonViews.viewedAt), asc(schema.lessonViews.id))
          .limit(limit),
      ])

      const answers: RecentActivityItem[] = answerRows.map((row) => ({
        id: `answer:${row.id}`,
        type: 'answer_recorded',
        occurredAt: row.occurredAt.getTime(),
        questionId: row.questionId,
        lessonId: row.lessonId || null,
        isCorrect: row.isCorrect,
      }))
      const lessonViews: RecentActivityItem[] = lessonViewRows.map((row) => ({
        id: `lesson-view:${row.id}`,
        type: 'lesson_viewed',
        occurredAt: row.occurredAt.getTime(),
        lessonId: row.lessonId,
      }))

      return [...answers, ...lessonViews]
    },
  }
}
