import { type ClientRequestOptions, createClient } from '@tsl/api/client'

export type ApiClient = ReturnType<typeof createClient>

export const localApiBaseUrl = 'http://localhost:8787'

const browserApiFetch: NonNullable<ClientRequestOptions['fetch']> = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => fetch(input, { ...init, credentials: 'include' })

export function createBrowserApiClient(): ApiClient {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

  if (!apiBaseUrl && process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is required in production')
  }

  return createClient(apiBaseUrl ?? localApiBaseUrl, { fetch: browserApiFetch })
}

/** 公開 API の応答はすべて共有 Zod スキーマで検証する（ADR-0021）。 */
export function parseApiResponse<T>(schema: { parse(data: unknown): T }, response: unknown): T {
  return schema.parse(response)
}

export async function requestJson(
  request: () => Promise<Response>,
  errorMessage: string,
): Promise<unknown> {
  const response = await request()

  if (!response.ok) {
    throw new Error(errorMessage)
  }

  return response.json()
}
