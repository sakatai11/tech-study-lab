'use client'

import { useCallback } from 'react'

import { createBrowserApiClient } from '@/lib/api'
import { type ClientQueryResult, useClientQuery } from '@/lib/use-client-query'

import { fetchDomains } from '../../api/domains-api'
import { domainsToViewModel } from '../../mapper'
import type { DomainTopicRoute, DomainsViewModel } from '../../view-model'

/** 領域別の習得状況をブラウザで取得する。記録後は study-activity で取得し直す（ADR-0019）。 */
export function useDomains(
  topicRoutes: readonly DomainTopicRoute[],
): ClientQueryResult<DomainsViewModel> {
  const load = useCallback(
    async () => domainsToViewModel(await fetchDomains(createBrowserApiClient()), topicRoutes),
    [topicRoutes],
  )

  return useClientQuery(load, { revalidateOn: ['study-activity'] })
}
