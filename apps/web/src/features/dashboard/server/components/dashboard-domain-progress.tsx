import 'server-only'

import type { DomainKey } from '@tsl/shared'

import { ProgressSummaryCard } from '@/components/ui/progress-summary-card'

import type { DashboardViewModel } from '../../view-model'

const domainColors: Record<DomainKey, 'green' | 'blue' | 'purple' | 'orange'> = {
  security: 'green',
  frontend: 'blue',
  backend: 'purple',
  architecture: 'orange',
}

export function DashboardDomainProgress({
  domains,
}: {
  domains: DashboardViewModel['domains']
}) {
  return (
    <section aria-labelledby="dashboard-domain-progress-heading">
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div>
          <h2 className="m-0 text-xl font-black text-ink" id="dashboard-domain-progress-heading">
            領域別の習得状況
          </h2>
          <p className="mb-0 mt-1 text-sm text-mute">APIの実データ · 4つの学習領域</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {domains.map((domain) => (
          <ProgressSummaryCard
            action={
              domain.firstTopicHref
                ? { href: domain.firstTopicHref, label: '最初のトピック →' }
                : { disabledLabel: '準備中' }
            }
            color={domainColors[domain.domain]}
            detail={
              <>
                {domain.masteredQuestionCount} / {domain.totalQuestionCount} 問習得 ·{' '}
                {domain.topicCount} topic · {domain.lessonCount} lesson
              </>
            }
            eyebrow={domain.domain}
            key={domain.domain}
            progressValue={domain.masteryRate}
            progressLabel={`${domain.label} の習得状況`}
            title={domain.label}
            value={`${domain.masteryRate}%`}
          />
        ))}
      </div>
    </section>
  )
}
