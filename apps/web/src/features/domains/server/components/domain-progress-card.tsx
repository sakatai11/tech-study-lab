import 'server-only'

import type { DomainKey } from '@tsl/shared'

import { ProgressSummaryCard } from '@/components/ui/progress-summary-card'
import type { DomainProgressViewModel } from '../../view-model'

const domainColors: Record<DomainKey, 'green' | 'blue' | 'purple' | 'orange'> = {
  security: 'green',
  frontend: 'blue',
  backend: 'purple',
  architecture: 'orange',
}

export function DomainProgressCard({ domain }: { domain: DomainProgressViewModel }) {
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
      progressValue={domain.masteryRate}
      progressLabel={`${domain.label} の習得状況`}
      title={domain.label}
      value={`${domain.masteryRate}%`}
    />
  )
}
