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

// Server loader が Service Binding から作った client。応答を Zod で再検証しない（ADR-0015）。
const serviceBindingClients = new WeakSet<ApiClient>()

/** Service Binding から作った Server 用の client を登録する。`api-server.ts` だけが呼ぶ。 */
export function markServiceBindingClient(client: ApiClient): ApiClient {
  serviceBindingClients.add(client)
  return client
}

/** 応答を共有スキーマで検証する。Service Binding の client だけは型どおりとして再検証を省く（ADR-0015）。 */
export function parseApiResponse<T>(
  client: ApiClient,
  schema: { parse(data: unknown): T },
  response: unknown,
): T {
  return serviceBindingClients.has(client) ? (response as T) : schema.parse(response)
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
