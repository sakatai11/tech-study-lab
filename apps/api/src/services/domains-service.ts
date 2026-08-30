import { DOMAIN_LABELS, type DomainKey } from '@tsl/shared'

import type { DomainsResponse } from '@tsl/shared'

export type DomainStatsRow = {
  domain: DomainKey
  masteredQuestionCount: number
  totalQuestionCount: number
  topicCount: number
  lessonCount: number
}

export type DomainsDeps = {
  findDomainStats(userId: string): Promise<DomainStatsRow[]>
}

type DomainsInput = {
  userId: string
}

const domainOrder = (
  Object.entries(DOMAIN_LABELS) as [DomainKey, (typeof DOMAIN_LABELS)[DomainKey]][]
)
  .sort(([, left], [, right]) => left.order - right.order)
  .map(([domain]) => domain)

function toSummary(row: DomainStatsRow | undefined, domain: DomainKey) {
  const totalQuestionCount = row?.totalQuestionCount ?? 0
  const masteredQuestionCount = row?.masteredQuestionCount ?? 0

  return {
    domain,
    masteredQuestionCount,
    totalQuestionCount,
    masteryRate:
      totalQuestionCount === 0 ? 0 : Math.round((masteredQuestionCount / totalQuestionCount) * 100),
    topicCount: row?.topicCount ?? 0,
    lessonCount: row?.lessonCount ?? 0,
  }
}

export async function getDomains(deps: DomainsDeps, input: DomainsInput): Promise<DomainsResponse> {
  const rows = await deps.findDomainStats(input.userId)
  const rowsByDomain = new Map(rows.map((row) => [row.domain, row]))

  return { domains: domainOrder.map((domain) => toSummary(rowsByDomain.get(domain), domain)) }
}
