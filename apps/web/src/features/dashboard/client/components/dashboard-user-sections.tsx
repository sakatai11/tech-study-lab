'use client'

import { LoadErrorCard, LoadingCard, RefreshErrorNotice } from '@/components/ui/load-state'

import { useDashboard } from '../hooks/use-dashboard'
import { DashboardDataContent } from './dashboard-data-content'
import { DashboardDueCard } from './dashboard-due-card'

/** /home のユーザー固有の区画。静的な page から content 由来のレッスン名だけを受け取る。 */
export function DashboardUserSections({
  lessonTitles,
}: {
  lessonTitles: Readonly<Record<string, string>>
}) {
  const dashboard = useDashboard(lessonTitles)

  if (dashboard.status === 'loading') return <LoadingCard label="学習の状況を読み込んでいます" />
  if (dashboard.status === 'error') {
    return (
      <LoadErrorCard
        code="dashboard_unavailable"
        links={[
          { href: '/', label: 'トップへ' },
          { href: '/analytics', label: '学習分析を見る' },
        ]}
        message="一時的な通信の問題が発生している可能性があります。再読み込みを試すか、トップへ戻ってください。"
        onRetry={dashboard.reload}
        title="ダッシュボードを読み込めませんでした"
      />
    )
  }

  return (
    <>
      {dashboard.refreshError ? <RefreshErrorNotice onRetry={dashboard.reload} /> : null}
      <section aria-label="今日の復習" className="grid grid-cols-1 gap-3">
        <DashboardDueCard dueCount={dashboard.data.due?.dueCount ?? null} />
      </section>
      <DashboardDataContent viewModel={dashboard.data} />
    </>
  )
}
