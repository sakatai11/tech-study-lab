import {
  type AnswerRequest,
  type AnswerResponse,
  answerRequestSchema,
  answerResponseSchema,
} from '@tsl/shared'

import { type ApiClient, createBrowserApiClient } from '@/lib/api'
import { requestJson } from '@/lib/api-response'

export async function submitAnswer(
  input: AnswerRequest,
  client: ApiClient = createBrowserApiClient(),
): Promise<AnswerResponse> {
  const response = await requestJson(
    () => client.answers.$post({ json: answerRequestSchema.parse(input) }),
    '解答の送信に失敗しました。もう一度お試しください。',
  )

  return answerResponseSchema.parse(response)
}
