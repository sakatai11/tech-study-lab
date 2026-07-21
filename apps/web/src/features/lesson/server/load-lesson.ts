import 'server-only'

import { getLessonContent } from '@/lib/content'

import { type LessonViewModel, lessonContentToViewModel } from '../view-model'

export function loadLesson(
  domain: string,
  topic: string,
  lessonId: string,
): LessonViewModel | undefined {
  const content = getLessonContent(lessonId)

  if (!content || content.domain !== domain || content.topic !== topic) {
    return undefined
  }

  return lessonContentToViewModel(content)
}
