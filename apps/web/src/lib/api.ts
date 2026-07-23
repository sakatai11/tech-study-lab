import { type ClientRequestOptions, createClient } from '@tsl/api/client'

declare global {
  interface CloudflareEnv {
    API?: Fetcher
  }
}

export type ApiClient = ReturnType<typeof createClient>

const browserApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787'
const serviceBindingBaseUrl = 'https://api.internal'

function createFallbackApiClient(): ApiClient {
  return createClient(process.env.API_BASE_URL ?? 'http://localhost:8787')
}

export function createBrowserApiClient(): ApiClient {
  return createClient(browserApiBaseUrl)
}

export async function createServerApiClient(): Promise<ApiClient> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = await getCloudflareContext({ async: true })
    if (env.API) {
      const apiFetcher: NonNullable<ClientRequestOptions['fetch']> = env.API.fetch.bind(env.API)
      return createClient(serviceBindingBaseUrl, { fetch: apiFetcher })
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cloudflare API service binding (API) is not configured.')
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw error
    }

    // Next.js Node runtime and local scripts use the URL fallback below.
  }

  return createFallbackApiClient()
}
