import type { DomainsResponse } from '@tsl/shared'

import {
  type DomainTopicRoute,
  domainsToProgressViewModel,
} from '@/features/shared/domain-progress'
import type { DomainsViewModel } from './view-model'

export function domainsToViewModel(
  response: DomainsResponse,
  topicRoutes: readonly DomainTopicRoute[] = [],
): DomainsViewModel {
  return {
    domains: domainsToProgressViewModel(response, topicRoutes),
  }
}
