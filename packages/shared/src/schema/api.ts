import { z } from 'zod'

/**
 * apps/api の入出力契約。
 * zValidator / route返り値(satisfies) / フロント(z.infer) の3経路で共有する
 * （design.md §8.6, §10.6）。
 */

export const answerRequestSchema = z.object({
  questionId: z.string().min(1),
  // choices は最大6（schema/content の .max(6) と整合）。
  selectedIndex: z.number().int().min(0).max(5),
  responseTimeMs: z.number().int().nonnegative().optional(),
})
export type AnswerRequest = z.infer<typeof answerRequestSchema>

export const answerResponseSchema = z.object({
  isCorrect: z.boolean(),
  // choices は最大6（schema/content の .max(6) と整合）。
  correctIndex: z.number().int().min(0).max(5),
})
export type AnswerResponse = z.infer<typeof answerResponseSchema>

export const reviewQueueResponseSchema = z.object({
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
