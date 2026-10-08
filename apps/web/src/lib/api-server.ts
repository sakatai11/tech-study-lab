import 'server-only'

import { env } from 'cloudflare:workers'
import { type ClientRequestOptions, createClient } from '@tsl/api/client'

import { type ApiClient, localApiBaseUrl } from './api'

// `wrangler types` が生成する `Cloudflare.Env` と宣言を衝突させず、Server 側で参照する binding だけを型付けする。
type WebWorkerEnv = {
  API?: Fetcher
}

const serviceBindingBaseUrl = 'https://api.internal'

// Workers runtime の module を Client bundle へ入れないため、Server loader 用の生成だけをこのファイルに分ける。
export async function createServerApiClient(): Promise<ApiClient> {
  const { API: api }: WebWorkerEnv = env

  if (api) {
    const apiFetcher: NonNullable<ClientRequestOptions['fetch']> = api.fetch.bind(api)
    return createClient(serviceBindingBaseUrl, { fetch: apiFetcher })
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Cloudflare API service binding (API) is not configured.')
  }

  return createClient(process.env.API_BASE_URL ?? localApiBaseUrl)
}
