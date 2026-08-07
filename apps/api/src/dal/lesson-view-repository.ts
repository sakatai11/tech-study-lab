import type { DrizzleD1Database } from 'drizzle-orm/d1'

import { db as schema } from '@tsl/shared'

import type { LessonViewDeps } from '../services/lesson-view-service'

export function createLessonViewDeps(db: DrizzleD1Database): LessonViewDeps {
  return {
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
