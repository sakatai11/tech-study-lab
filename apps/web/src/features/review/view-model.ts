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
