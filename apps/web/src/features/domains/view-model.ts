import type { DomainKey, DomainsResponse } from '@tsl/shared'

export type DomainTopicRoute = {
  domain: DomainKey
  topic: string
  order: number
}

type DomainSummary = DomainsResponse['domains'][number]

export type DomainProgressViewModel = DomainSummary & {
  label: string
  firstTopicHref?: string
}

export type DomainsViewModel = {
  domains: DomainProgressViewModel[]
}
