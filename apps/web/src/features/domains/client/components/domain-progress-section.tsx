'use client'

import { LoadErrorCard, LoadingCard } from '@/components/ui/load-state'

import type { DomainTopicRoute } from '../../view-model'
import { useDomains } from '../hooks/use-domains'
import { DomainProgressCard } from './domain-progress-card'

export function DomainProgressSection({
  topicRoutes,
}: {
  topicRoutes: readonly DomainTopicRoute[]
}) {
  const domains = useDomains(topicRoutes)

  return (
    <section aria-labelledby="domain-progress-heading">
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div>
          <h2 className="m-0 text-xl font-black text-ink" id="domain-progress-heading">
            領域別の習得状況
          </h2>
          <p className="mb-0 mt-1 text-sm text-mute">
            復習間隔が21日以上になった問題を習得済みとして数えます
          </p>
        </div>
      </div>
      {domains.status === 'loading' ? (
        <LoadingCard label="領域別の習得状況を読み込んでいます" />
      ) : domains.status === 'error' ? (
        <LoadErrorCard
          code="domains_unavailable"
          links={[{ href: '/home', label: 'ホームへ' }]}
          message="一時的な通信の問題が発生している可能性があります。再読み込みを試すか、ホームへ戻ってください。"
          onRetry={domains.reload}
          title="学習領域を読み込めませんでした"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {domains.data.domains.map((domain) => (
            <DomainProgressCard domain={domain} key={domain.domain} />
          ))}
        </div>
      )}
    </section>
  )
}
