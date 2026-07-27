import { hc } from 'hono/client'
import type { ClientRequestOptions } from 'hono/client'
import type { AppType } from './index'

// フロントから利用する型安全クライアントのファクトリ
export const createClient = (baseUrl: string, options?: ClientRequestOptions) =>
  hc<AppType>(baseUrl, options)

export type { AppType }
export type { ClientRequestOptions }
