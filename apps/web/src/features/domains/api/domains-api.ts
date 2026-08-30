import { type DomainsResponse, domainsResponseSchema } from '@tsl/shared'

import { type ApiClient, requestJson } from '@/lib/api'

export async function fetchDomains(client: ApiClient): Promise<DomainsResponse> {
  const response = await requestJson(
    () => client.domains.$get({ query: {} }),
    '領域別進捗の取得に失敗しました。',
  )

  return domainsResponseSchema.parse(response)
}
