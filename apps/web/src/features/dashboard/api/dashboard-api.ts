import { type DueCountResponse, dueCountResponseSchema } from '@tsl/shared'

import { type ApiClient, requestJson } from '@/lib/api'

/** ダッシュボードで使う due 件数エンドポイントの型安全な境界。 */
export async function fetchDueCount(client: ApiClient): Promise<DueCountResponse> {
  const response = await requestJson(
    () => client.dashboard['due-count'].$get(),
    '復習件数の取得に失敗しました。',
  )

  return dueCountResponseSchema.parse(response)
}
