import {
  type AnswerRequest,
  type AnswerResponse,
  answerRequestSchema,
  answerResponseSchema,
} from '@tsl/shared'

import { type ApiClient, requestJson } from '@/lib/api'

export async function submitAnswer(
  client: ApiClient,
  input: AnswerRequest,
): Promise<AnswerResponse> {
  const response = await requestJson(
    () => client.answers.$post({ json: answerRequestSchema.parse(input) }),
    '解答の送信に失敗しました。もう一度お試しください。',
  )

  return answerResponseSchema.parse(response)
}
