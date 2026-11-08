import type { McqQuestion } from '@tsl/shared'

/**
 * 復習で queue の ID と結合する問題本文。ビルド時に静的な page から Client へ渡すため、
 * 正解（answerIndex）を含めない（ADR-0002、ADR-0019）。
 */
export type ReviewQuestionIndexEntry = Pick<
  McqQuestion,
  'id' | 'prompt' | 'choices' | 'explanation'
>

export type ReviewPreviewViewModel = {
  overdueDays: number
  questionId: string
}

export type ReviewQuestionViewModel = {
  choices: string[]
  id: string
  prompt: string
}

export type ReviewViewModel = {
  batchKey: string
  dueCount: number
  hasMore: boolean
  explanations: Record<string, string>
  questions: ReviewQuestionViewModel[]
  resultHomeHref: string
  resultHomeLabel: string
  title: string
  previews: ReviewPreviewViewModel[]
}
