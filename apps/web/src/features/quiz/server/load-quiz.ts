import 'server-only'

import { getLessonContent, getLessonsByTopic } from '@/lib/content'

import { quizContentToViewModel } from '../mapper'
import type { QuizViewModel } from '../view-model'

export function loadQuiz(lessonId: string): QuizViewModel | undefined {
  const content = getLessonContent(lessonId)

  if (!content) {
    return undefined
  }

  const lessons = getLessonsByTopic(content.domain, content.topic)
  const currentIndex = lessons.findIndex((lesson) => lesson.lessonId === lessonId)
  const nextLessonId = currentIndex >= 0 ? lessons[currentIndex + 1]?.lessonId : undefined

  return quizContentToViewModel(content, nextLessonId)
}
