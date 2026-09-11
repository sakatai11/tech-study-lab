import type { DomainProgressData } from '@/features/shared/domain-progress'

export type { DomainTopicRoute } from '@/features/shared/domain-progress'

export type DomainProgressViewModel = DomainProgressData

export type DomainsViewModel = {
  domains: DomainProgressViewModel[]
}
