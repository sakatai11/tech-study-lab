import type { DomainKey } from '@tsl/shared'

import { ProgressSummaryCard } from './progress-summary-card'

const domainColors: Record<DomainKey, 'green' | 'blue' | 'purple' | 'orange'> = {
  security: 'green',
  frontend: 'blue',
  backend: 'purple',
  architecture: 'orange',
}

export type DomainProgressCardData = {
  domain: DomainKey
  label: string
  masteredQuestionCount: number
  totalQuestionCount: number
  masteryRate: number
  topicCount: number
  lessonCount: number
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
          ? { href: domain.firstTopicHref, label: '最初のトピック →' }
          : { disabledLabel: '準備中' }
      }
      color={domainColors[domain.domain]}
      detail={
        <>
          {domain.masteredQuestionCount} / {domain.totalQuestionCount} 問習得 · {domain.topicCount}{' '}
          topic · {domain.lessonCount} lesson
        </>
      }
      eyebrow={domain.domain}
      progressLabel={`${domain.label} の習得状況`}
      progressValue={domain.masteryRate}
      title={domain.label}
      value={`${domain.masteryRate}%`}
    />
  )
}
