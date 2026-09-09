import type { DomainProgressData } from '@/features/shared/domain-progress'

export type { DomainTopicRoute } from '@/features/shared/domain-progress'

export type DomainViewModel = DomainProgressData

export type DomainsViewModel = {
  domains: DomainViewModel[]
}
