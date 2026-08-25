import type { DomainKey, DomainsResponse } from '@tsl/shared'

export type DomainProgressViewModel = DomainsResponse['domains'][number] & {
  label: string
  firstTopicHref?: string
}

export type DomainsViewModel = {
  domains: DomainProgressViewModel[]
}

export type DomainTopicRoute = {
  domain: DomainKey
  topic: string
  order: number
}
