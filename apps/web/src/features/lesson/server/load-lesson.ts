import 'server-only'

import { getLessonContent, getLessonRouteParams } from '@/lib/content'

import { lessonContentToViewModel } from '../mapper'
import type { LessonViewModel } from '../view-model'

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

/** `generateStaticParams` に渡す route params。page から lib/content を直接読まないための委譲。 */
export function listLessonRouteParams() {
  return getLessonRouteParams()
}
