import { z } from 'zod'

/**
 * content/ 配下の Markdown(frontmatter) を検証するスキーマ。
 * 教材・問題の一次ソースの形を定義する。問題は初期は 4択(mcq)に統一し、
 * type フィールドで将来の記述式・コード問題を拡張できるようにする。
 */

export const domainKeySchema = z.enum(['security', 'frontend', 'backend', 'architecture'])
export type DomainKey = z.infer<typeof domainKeySchema>

export const DOMAIN_LABELS: Record<DomainKey, { label: string; order: number }> = {
  security: { label: 'セキュリティ', order: 1 },
  frontend: { label: 'フロントエンド', order: 2 },
  backend: { label: 'バックエンド', order: 3 },
  architecture: { label: 'アーキテクチャ', order: 4 },
}

export const topicFrontmatterSchema = z.object({
  topic: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().nonnegative(),
})
export type TopicFrontmatter = z.infer<typeof topicFrontmatterSchema>

export const lessonIdSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'lessonId must contain only lowercase letters, numbers, and hyphens')

export const questionIdSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'questionId must contain only lowercase letters, numbers, and hyphens')

export const mcqQuestionSchema = z.object({
  id: questionIdSchema,
  type: z.literal('mcq'),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(6),
  answerIndex: z.number().int().nonnegative(),
  explanation: z.string().min(1),
})
export type McqQuestion = z.infer<typeof mcqQuestionSchema>

// 将来の拡張ポイント：記述式・コード問題はここに discriminated union で追加する。
export const questionSchema = z.discriminatedUnion('type', [mcqQuestionSchema])
export type Question = z.infer<typeof questionSchema>

export const lessonFrontmatterSchema = z.object({
  domain: domainKeySchema,
  topic: z.string().min(1),
  lessonId: lessonIdSchema,
  title: z.string().min(1),
  questions: z.array(questionSchema).min(1),
})
export type LessonFrontmatter = z.infer<typeof lessonFrontmatterSchema>

// answerIndex が choices の範囲内か検証する。
export const validatedMcqSchema = mcqQuestionSchema.refine(
  (q) => q.answerIndex < q.choices.length,
  {
    message: 'answerIndex must point to an existing choice',
    path: ['answerIndex'],
  },
)

export const validatedLessonFrontmatterSchema = lessonFrontmatterSchema.superRefine(
  (lesson, ctx) => {
    const questionIdPattern = new RegExp(`^${lesson.lessonId}-q\\d+$`)

    for (const [i, question] of lesson.questions.entries()) {
      if (!questionIdPattern.test(question.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `questionId must match pattern ${lesson.lessonId}-q<number>`,
          path: ['questions', i, 'id'],
        })
      }
    }
  },
)
