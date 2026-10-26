import type { DomainKey } from '@tsl/shared'

import type { QuizQuestionViewModel } from '@/features/shared/quiz-question'

export type { QuizQuestionViewModel }

export type QuizViewModel = {
  domain: string
  topic: string
  lessonId: string
  title: string
  questions: QuizQuestionViewModel[]
  explanations: Record<string, string>
  nextLessonId?: string
  resultHomeHref?: string
  resultHomeLabel?: string
}

export type SubmittedAnswer = {
  isCorrect: boolean
  correctIndex: number
  selectedIndex: number
}

export type QuizCatalogViewModel = {
  domains: {
    domain: DomainKey
    label: string
    topics: {
      topic: string
      title: string
      lessons: {
        lessonId: string
        title: string
        questionCount: number
        href: string
      }[]
    }[]
  }[]
}
