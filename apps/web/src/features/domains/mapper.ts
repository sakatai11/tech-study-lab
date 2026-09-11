import type { DomainsResponse } from '@tsl/shared'

import { type DomainTopicRoute, domainsToProgressData } from '@/features/shared/domain-progress'
import type { DomainsViewModel } from './view-model'

export function domainsToViewModel(
  response: DomainsResponse,
  topicRoutes: readonly DomainTopicRoute[] = [],
): DomainsViewModel {
  return {
    domains: domainsToProgressData(response, topicRoutes),
  }
}
