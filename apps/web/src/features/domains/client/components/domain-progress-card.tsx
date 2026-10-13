'use client'

import type { DomainsResponse } from '@tsl/shared'

import { ProgressSummaryCard } from '@/components/ui/progress-summary-card'
import { domainIcons, domainTones } from '@/features/shared/domain-icon'

type DomainSummary = DomainsResponse['domains'][number]

/** Domains feature が公開する表示用カードの入力契約。 */
export type DomainProgressCardData = DomainSummary & {
  label: string
  firstTopicHref?: string
}

export type DomainProgressCardProps = {
  domain: DomainProgressCardData
}

export function DomainProgressCard({ domain }: DomainProgressCardProps) {
  return (
    <ProgressSummaryCard
      action={
        domain.firstTopicHref
          ? { href: domain.firstTopicHref, label: '最初のトピック' }
          : { disabledLabel: '準備中' }
      }
      color={domainTones[domain.domain]}
      detail={
        domain.totalQuestionCount > 0 ? (
          <>
            {domain.totalQuestionCount}問中{domain.masteredQuestionCount}問習得 ·{' '}
            {domain.topicCount}
            トピック · {domain.lessonCount}レッスン
          </>
        ) : (
          '教材を準備しています'
        )
      }
      eyebrow={domain.domain}
      icon={domainIcons[domain.domain]}
      progressLabel={`${domain.label} の習得状況`}
      progressValue={domain.masteryRate}
      title={domain.label}
      value={`${domain.masteryRate}%`}
    />
  )
}
