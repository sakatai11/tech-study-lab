import Link from 'next/link'

import { DOMAIN_LABELS, type DomainKey } from '@tsl/shared'

import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'

import type { DomainProgressViewModel } from '../../view-model'

const domainColors: Record<DomainKey, 'green' | 'blue' | 'purple' | 'orange'> = {
  security: 'green',
  frontend: 'blue',
  backend: 'purple',
  architecture: 'orange',
}

export function DomainProgressCard({ domain }: { domain: DomainProgressViewModel }) {
  const color = domainColors[domain.domain]

  return (
    <Card className="flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 font-mono text-xs font-bold uppercase tracking-[0.16em] text-faint">
            {DOMAIN_LABELS[domain.domain].label}
          </p>
          <h3 className="mb-0 mt-2 text-xl font-black text-ink">{domain.label}</h3>
        </div>
        <span className="font-mono text-2xl font-black tabular-nums text-ink">
          {domain.masteryRate}%
        </span>
      </div>
      <ProgressBar
        className="mt-5"
        color={color}
        label={`${domain.label} の習得状況`}
        value={domain.masteryRate}
      />
      <p className="mb-0 mt-3 text-sm text-mute">
        {domain.masteredQuestionCount} / {domain.totalQuestionCount} 問習得 · {domain.topicCount}{' '}
        topic · {domain.lessonCount} lesson
      </p>
      <div className="mt-auto pt-5">
        {domain.firstTopicHref ? (
          <Link
            className="inline-flex min-h-11 items-center font-bold text-blue underline-offset-4 hover:underline"
            href={domain.firstTopicHref}
          >
            最初のトピック →
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex min-h-11 items-center font-semibold text-faint"
          >
            準備中
          </span>
        )}
      </div>
    </Card>
  )
}
