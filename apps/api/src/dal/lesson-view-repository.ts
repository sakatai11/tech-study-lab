import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'

import { db as schema } from '@tsl/shared'

import type { LessonViewDeps } from '../services/lesson-view-service'

export function createLessonViewDeps(db: DrizzleD1Database): LessonViewDeps {
  return {
    async lessonExists(lessonId) {
      // 教材は1問以上の問題を持つため、active な問題の lesson_id 集合が現在の教材集合になる（ADR-0022）。
      const [question] = await db
        .select({ questionId: schema.questions.questionId })
        .from(schema.questions)
        .where(and(eq(schema.questions.lessonId, lessonId), eq(schema.questions.isActive, true)))
        .limit(1)

      return question !== undefined
    },

    async recordLessonView(params) {
      await db.insert(schema.lessonViews).values({
        id: crypto.randomUUID(),
        userId: params.userId,
        lessonId: params.lessonId,
        viewedAt: new Date(params.viewedAt),
      })
    },
  }
}
