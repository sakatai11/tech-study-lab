import { hc } from 'hono/client'
import type { AppType } from './index'

// フロントから利用する型安全クライアントのファクトリ
export const createClient = (baseUrl: string) => hc<AppType>(baseUrl)

export type { AppType }
