import { type ClientRequestOptions, createClient } from '@tsl/api/client'

declare global {
  interface CloudflareEnv {
    API?: Fetcher
  }
}

export type ApiClient = ReturnType<typeof createClient>

const browserApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787'

export function createBrowserApiClient(): ApiClient {
  return createClient(browserApiBaseUrl)
}

export async function createServerApiClient(): Promise<ApiClient> {
  let apiFetcher: NonNullable<ClientRequestOptions['fetch']> | undefined

  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = await getCloudflareContext({ async: true })
    apiFetcher = env.API?.fetch.bind(env.API)
  } catch {
    // Next.js Node runtime and local scripts use the URL fallback below.
  }

  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:8787'
  return createClient(apiBaseUrl, apiFetcher ? { fetch: apiFetcher } : undefined)
}
