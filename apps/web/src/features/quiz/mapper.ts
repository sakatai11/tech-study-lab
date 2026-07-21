import type { BundledLesson } from '@tsl/shared'

import { contentQuestionToQuizQuestion } from '../shared/quiz-question'

import type { QuizViewModel } from './view-model'

export function quizContentToViewModel(
  content: BundledLesson,
  nextLessonId?: string,
): QuizViewModel {
  return {
    domain: content.domain,
    topic: content.topic,
    lessonId: content.lessonId,
    title: content.title,
    questions: content.questions.map(contentQuestionToQuizQuestion),
    explanations: Object.fromEntries(
      content.questions.map((question) => [question.id, question.explanation]),
    ),
    nextLessonId,
  }
}
