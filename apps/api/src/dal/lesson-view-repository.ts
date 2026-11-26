import { and, eq, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'

import { db as schema } from '@tsl/shared'

import type { LessonViewDeps } from '../services/lesson-view-service'

export function createLessonViewDeps(db: DrizzleD1Database): LessonViewDeps {
  return {
    async recordLessonViewIfLessonExists(params) {
      // 教材は1問以上の問題を持つため、active な問題の lesson_id 集合が現在の教材集合になる。
      // 照合と INSERT を1文にまとめ、content 同期で教材が inactive になった直後の閲覧を記録しない（ADR-0022）。
      const result = await db
        .insert(schema.lessonViews)
        .select(
          db
            .select({
              id: sql<string>`${crypto.randomUUID()}`.as('id'),
              userId: sql<string>`${params.userId}`.as('user_id'),
              lessonId: sql<string>`${params.lessonId}`.as('lesson_id'),
              viewedAt: sql<number>`${params.viewedAt}`.as('viewed_at'),
            })
            .from(schema.questions)
            .where(
              and(
                eq(schema.questions.lessonId, params.lessonId),
                eq(schema.questions.isActive, true),
              ),
            )
            .limit(1),
        )
        .run()

      return result.meta.changes === 1
    },
  }
}
