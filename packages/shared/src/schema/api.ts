import { z } from 'zod'

import { domainKeySchema } from './content'

/**
 * apps/api の入出力契約。
 * zValidator / route返り値(satisfies) / フロント(z.infer) の3経路で共有する
 * （design.md §8.6, §10.6）。
 */

export const answerRequestSchema = z
  .object({
    questionId: z.string().min(1),
    // choices は最大6（schema/content の .max(6) と整合）。
    selectedIndex: z.number().int().min(0).max(5),
    responseTimeMs: z.number().int().nonnegative().optional(),
  })
  .strict()
export type AnswerRequest = z.infer<typeof answerRequestSchema>

export const answerResponseSchema = z.object({
  isCorrect: z.boolean(),
  // choices は最大6（schema/content の .max(6) と整合）。
  correctIndex: z.number().int().min(0).max(5),
})
export type AnswerResponse = z.infer<typeof answerResponseSchema>

export const lessonViewRequestSchema = z
  .object({
    lessonId: z.string().min(1),
  })
  .strict()
export type LessonViewRequest = z.infer<typeof lessonViewRequestSchema>

export const lessonViewResponseSchema = z.object({
  recorded: z.literal(true),
})
export type LessonViewResponse = z.infer<typeof lessonViewResponseSchema>

export const rateLimitedErrorResponseSchema = z.object({
  error: z.object({
    code: z.literal('RATE_LIMITED'),
    message: z.literal('Too Many Requests'),
  }),
})
export type RateLimitedErrorResponse = z.infer<typeof rateLimitedErrorResponseSchema>

export const rateLimitUnavailableErrorResponseSchema = z.object({
  error: z.object({
    code: z.literal('RATE_LIMIT_UNAVAILABLE'),
    message: z.literal('Rate limit unavailable'),
  }),
})
export type RateLimitUnavailableErrorResponse = z.infer<
  typeof rateLimitUnavailableErrorResponseSchema
>

export const reviewQueueResponseSchema = z.object({
  hasMore: z.boolean(),
  items: z
    .array(
      z.object({
        questionId: z.string().min(1),
        // Unix epoch milliseconds（SRS の dueAt と同じ表現）。
        dueAt: z.number().int().nonnegative(),
      }),
    )
    .max(20),
})
export type ReviewQueueResponse = z.infer<typeof reviewQueueResponseSchema>

export const dueCountResponseSchema = z.object({
  dueCount: z.number().int().nonnegative(),
})
export type DueCountResponse = z.infer<typeof dueCountResponseSchema>

export const domainSummarySchema = z.object({
  domain: domainKeySchema,
  masteredQuestionCount: z.number().int().nonnegative(),
  totalQuestionCount: z.number().int().nonnegative(),
  masteryRate: z.number().int().min(0).max(100),
  topicCount: z.number().int().nonnegative(),
  lessonCount: z.number().int().nonnegative(),
})
export type DomainSummary = z.infer<typeof domainSummarySchema>

export const domainsResponseSchema = z.object({
  domains: z.array(domainSummarySchema).length(4),
})
export type DomainsResponse = z.infer<typeof domainsResponseSchema>

export const domainsRequestSchema = z.object({}).strict()
export type DomainsRequest = z.infer<typeof domainsRequestSchema>
