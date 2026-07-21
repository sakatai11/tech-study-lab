import { createClient } from '@tsl/api/client'
import { type AnswerRequest, type AnswerResponse, answerResponseSchema } from '@tsl/shared'

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787'
const apiClient = createClient(apiBaseUrl)

export async function submitAnswer(input: AnswerRequest): Promise<AnswerResponse> {
  const response = await apiClient.answers.$post({ json: input })

  if (!response.ok) {
    throw new Error('解答の送信に失敗しました。もう一度お試しください。')
  }

  return answerResponseSchema.parse(await response.json())
}
