import { z } from "zod";

/**
 * content/ 配下の Markdown(frontmatter) を検証するスキーマ。
 * 教材・問題の一次ソースの形を定義する。問題は初期は 4択(mcq)に統一し、
 * type フィールドで将来の記述式・コード問題を拡張できるようにする。
 */

export const domainKeySchema = z.enum([
  "security",
  "frontend",
  "backend",
  "architecture",
]);
export type DomainKey = z.infer<typeof domainKeySchema>;

export const mcqQuestionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("mcq"),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(6),
  answerIndex: z.number().int().nonnegative(),
  explanation: z.string().min(1),
});
export type McqQuestion = z.infer<typeof mcqQuestionSchema>;

// 将来の拡張ポイント：記述式・コード問題はここに discriminated union で追加する。
export const questionSchema = z.discriminatedUnion("type", [mcqQuestionSchema]);
export type Question = z.infer<typeof questionSchema>;

export const lessonFrontmatterSchema = z.object({
  domain: domainKeySchema,
  topic: z.string().min(1),
  lessonId: z.string().min(1),
  title: z.string().min(1),
  questions: z.array(questionSchema).min(1),
});
export type LessonFrontmatter = z.infer<typeof lessonFrontmatterSchema>;

// answerIndex が choices の範囲内か検証する。
export const validatedMcqSchema = mcqQuestionSchema.refine(
  (q) => q.answerIndex < q.choices.length,
  {
    message: "answerIndex must point to an existing choice",
    path: ["answerIndex"],
  },
);
