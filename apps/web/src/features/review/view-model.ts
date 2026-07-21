import type { QuizViewModel } from '@/features/quiz/view-model'

export type ReviewPreviewViewModel = {
  overdueDays: number
  questionId: string
}

export type ReviewViewModel = QuizViewModel & {
  batchKey: string
  dueCount: number
  hasNextBatch: boolean
  previews: ReviewPreviewViewModel[]
}
