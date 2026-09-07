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

export const domainsResponseSchema = z
  .object({
    domains: z.array(domainSummarySchema).length(4),
  })
  .superRefine(({ domains }, context) => {
    const uniqueDomains = new Set(domains.map(({ domain }) => domain))
    if (uniqueDomains.size !== domains.length) {
      context.addIssue({
        code: 'custom',
        path: ['domains'],
        message: 'domains must contain each domain exactly once',
      })
    }
  })
export type DomainsResponse = z.infer<typeof domainsResponseSchema>

export const domainsRequestSchema = z.object({}).strict()
export type DomainsRequest = z.infer<typeof domainsRequestSchema>

export const analyticsRequestSchema = z.object({}).strict()
export type AnalyticsRequest = z.infer<typeof analyticsRequestSchema>

export const retentionDistributionSchema = z.object({
  masteredCount: z.number().int().nonnegative(),
  learningCount: z.number().int().nonnegative(),
  dueCount: z.number().int().nonnegative(),
})
export type RetentionDistribution = z.infer<typeof retentionDistributionSchema>

export const analyticsSummaryResponseSchema = z.object({
  totalAnswerCount: z.number().int().nonnegative(),
  correctAnswerRate: z.number().int().min(0).max(100),
  averageResponseTimeMs: z.number().int().nonnegative(),
  masteredQuestionCount: z.number().int().nonnegative(),
  currentStreakDays: z.number().int().nonnegative(),
  thisWeekStudyTimeMs: z.number().int().nonnegative(),
  retentionDistribution: retentionDistributionSchema,
})
export type AnalyticsSummaryResponse = z.infer<typeof analyticsSummaryResponseSchema>

const isoCalendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/

function isValidCalendarDate(value: string): boolean {
  const match = isoCalendarDatePattern.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]

  return month >= 1 && month <= 12 && day >= 1 && day <= (daysInMonth ?? 0)
}

const analyticsWeeklyDateSchema = z
  .string()
  .regex(isoCalendarDatePattern)
  .refine(isValidCalendarDate, { message: 'date must be a valid calendar date' })

export const analyticsWeeklyDaySchema = z
  .object({
    date: analyticsWeeklyDateSchema,
    weekday: z.number().int().min(1).max(7),
    answerCount: z.number().int().nonnegative(),
  })
  .superRefine(({ date, weekday }, context) => {
    if (isValidCalendarDate(date) && (new Date(`${date}T00:00:00Z`).getUTCDay() || 7) !== weekday) {
      context.addIssue({
        code: 'custom',
        path: ['weekday'],
        message: 'weekday must match the UTC date',
      })
    }
  })
export type AnalyticsWeeklyDay = z.infer<typeof analyticsWeeklyDaySchema>

export const analyticsWeeklyResponseSchema = z
  .object({
    days: z.array(analyticsWeeklyDaySchema).length(7),
  })
  .superRefine(({ days }, context) => {
    const uniqueDates = new Set(days.map(({ date }) => date))
    days.forEach((day, index) => {
      const previous = days[index - 1]
      if (
        previous &&
        Date.parse(`${day.date}T00:00:00Z`) - Date.parse(`${previous.date}T00:00:00Z`) !==
          86_400_000
      ) {
        context.addIssue({
          code: 'custom',
          path: ['days', index, 'date'],
          message: 'days must be consecutive and in ascending order',
        })
      }
    })
    if (uniqueDates.size !== days.length) {
      context.addIssue({
        code: 'custom',
        path: ['days'],
        message: 'days must contain unique dates',
      })
    }
  })
export type AnalyticsWeeklyResponse = z.infer<typeof analyticsWeeklyResponseSchema>

export const mistakeItemSchema = z
  .object({
    questionId: z.string().min(1),
    incorrectRate: z.number().min(0).max(100),
    answerCount: z.number().int().min(2),
    incorrectAnswerCount: z.number().int().nonnegative(),
  })
  .superRefine(({ answerCount, incorrectAnswerCount, incorrectRate }, context) => {
    if (incorrectRate !== Math.round((incorrectAnswerCount / answerCount) * 1000) / 10) {
      context.addIssue({
        code: 'custom',
        path: ['incorrectRate'],
        message: 'incorrectRate must match the counts rounded to one decimal place',
      })
    }
    if (incorrectAnswerCount > answerCount) {
      context.addIssue({
        code: 'custom',
        path: ['incorrectAnswerCount'],
        message: 'incorrectAnswerCount must not exceed answerCount',
      })
    }
  })
export type MistakeItem = z.infer<typeof mistakeItemSchema>

/** Compare the unrounded error rate, then answer count and question ID. */
export function compareMistakeRank(
  left: Pick<MistakeItem, 'answerCount' | 'incorrectAnswerCount' | 'questionId'>,
  right: Pick<MistakeItem, 'answerCount' | 'incorrectAnswerCount' | 'questionId'>,
): number {
  return (
    right.incorrectAnswerCount / right.answerCount - left.incorrectAnswerCount / left.answerCount ||
    right.answerCount - left.answerCount ||
    left.questionId.localeCompare(right.questionId, 'en')
  )
}

export const mistakesResponseSchema = z
  .object({
    items: z.array(mistakeItemSchema).max(10),
  })
  .superRefine(({ items }, context) => {
    items.forEach((item, index) => {
      const previous = items[index - 1]
      if (previous && compareMistakeRank(previous, item) > 0) {
        context.addIssue({
          code: 'custom',
          path: ['items', index],
          message: 'items must follow mistake ranking order',
        })
      }
    })
  })
export type MistakesResponse = z.infer<typeof mistakesResponseSchema>
