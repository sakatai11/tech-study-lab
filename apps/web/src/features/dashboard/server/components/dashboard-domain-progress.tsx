import 'server-only'

import { DomainProgressCard } from '@/features/domains/components/domain-progress-card'

import type { DashboardViewModel } from '../../view-model'

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
          <DomainProgressCard domain={domain} key={domain.domain} />
        ))}
      </div>
    </section>
  )
}
