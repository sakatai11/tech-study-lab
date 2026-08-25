import 'server-only'

import { domainKeySchema } from '@tsl/shared'
import { connection } from 'next/server'

import { createServerApiClient } from '@/lib/api'
import { getOrderedTopicRoutes } from '@/lib/content'

import { fetchDomains } from '../api/domains-api'
import { domainsToViewModel } from '../mapper'
import type { DomainTopicRoute, DomainsViewModel } from '../view-model'

export async function loadDomains(): Promise<DomainsViewModel> {
  await connection()

  const topicRoutes: DomainTopicRoute[] = getOrderedTopicRoutes().flatMap((route) => {
    const result = domainKeySchema.safeParse(route.domain)
    return result.success ? [{ domain: result.data, topic: route.topic, order: route.order }] : []
  })

  return domainsToViewModel(await fetchDomains(await createServerApiClient()), topicRoutes)
}
