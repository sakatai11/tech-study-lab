import { and, count, countDistinct, eq, gte } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'

import { domainKeySchema, db as schema } from '@tsl/shared'

import type { DomainsDeps } from '../services/domains-service'

/** active な current content だけを user ごとの SRS 状態と集計する。 */
export function createDomainsDeps(db: DrizzleD1Database): DomainsDeps {
  return {
    async findDomainStats(userId) {
      const rows = await db
        .select({
          domain: schema.questions.domain,
          masteredQuestionCount: count(schema.srsStates.questionId),
          totalQuestionCount: count(schema.questions.questionId),
          topicCount: countDistinct(schema.questions.topic),
          lessonCount: countDistinct(schema.questions.lessonId),
        })
        .from(schema.questions)
        .leftJoin(
          schema.srsStates,
          and(
            eq(schema.srsStates.questionId, schema.questions.questionId),
            eq(schema.srsStates.userId, userId),
            gte(schema.srsStates.intervalDays, 21),
          ),
        )
        .where(eq(schema.questions.isActive, true))
        .groupBy(schema.questions.domain)

      return rows.map((row) => ({
        domain: domainKeySchema.parse(row.domain),
        masteredQuestionCount: Number(row.masteredQuestionCount),
        totalQuestionCount: Number(row.totalQuestionCount),
        topicCount: Number(row.topicCount),
        lessonCount: Number(row.lessonCount),
      }))
    },
  }
}
