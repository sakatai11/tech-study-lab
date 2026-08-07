import {
  type LessonViewRequest,
  type LessonViewResponse,
  lessonViewRequestSchema,
  lessonViewResponseSchema,
} from '@tsl/shared'

import { type ApiClient, requestJson } from '@/lib/api'

export async function recordLessonView(
  client: ApiClient,
  input: LessonViewRequest,
): Promise<LessonViewResponse> {
  const response = await requestJson(
    () => client['lesson-views'].$post({ json: lessonViewRequestSchema.parse(input) }),
    '教材の閲覧記録に失敗しました。',
  )

  return lessonViewResponseSchema.parse(response)
}
