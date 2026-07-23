import type { McqQuestion } from '@tsl/shared'

export type QuizQuestionViewModel = {
  id: string
  prompt: string
  choices: string[]
}

export function contentQuestionToQuizQuestion(question: McqQuestion): QuizQuestionViewModel {
  return {
    id: question.id,
    prompt: question.prompt,
    choices: [...question.choices],
  }
}
