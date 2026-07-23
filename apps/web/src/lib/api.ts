import { type ClientRequestOptions, createClient } from '@tsl/api/client'

declare global {
  interface CloudflareEnv {
    API?: Fetcher
  }
}

export type ApiClient = ReturnType<typeof createClient>

const localApiBaseUrl = 'http://localhost:8787'
const serviceBindingBaseUrl = 'https://api.internal'

function createFallbackApiClient(): ApiClient {
  return createClient(process.env.API_BASE_URL ?? localApiBaseUrl)
}

export function createBrowserApiClient(): ApiClient {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

  if (!apiBaseUrl && process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is required in production')
  }

  return createClient(apiBaseUrl ?? localApiBaseUrl)
}

export async function createServerApiClient(): Promise<ApiClient> {
  const isLocalRuntime = process.env.NODE_ENV !== 'production'

  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = await getCloudflareContext({ async: true })
    if (env.API) {
      const apiFetcher: NonNullable<ClientRequestOptions['fetch']> = env.API.fetch.bind(env.API)
      return createClient(serviceBindingBaseUrl, { fetch: apiFetcher })
    }

    if (!isLocalRuntime) {
      throw new Error('Cloudflare API service binding (API) is not configured.')
    }
  } catch (error) {
    if (!isLocalRuntime) {
      throw error
    }
  }

  return createFallbackApiClient()
}
