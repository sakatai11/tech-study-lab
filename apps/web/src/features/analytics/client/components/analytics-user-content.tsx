'use client'

import { LoadErrorCard, LoadingCard, RefreshErrorNotice } from '@/components/ui/load-state'

import { useAnalytics } from '../hooks/use-analytics'
import { AnalyticsDashboard } from './analytics-dashboard'

/** API の値を使う区画だけをブラウザで取得して描画する（ADR-0019）。 */
export function AnalyticsUserContent() {
  const analytics = useAnalytics()

  if (analytics.status === 'loading') return <LoadingCard label="学習分析を読み込んでいます" />
  if (analytics.status === 'error') {
    return (
      <LoadErrorCard
        code="analytics_unavailable"
        links={[{ href: '/home', label: 'ホームへ' }]}
        message="一時的な通信の問題が発生している可能性があります。再読み込みを試すか、ホームへ戻ってください。"
        onRetry={analytics.reload}
        title="学習分析を読み込めませんでした"
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {analytics.refreshError ? <RefreshErrorNotice onRetry={analytics.reload} /> : null}
      <AnalyticsDashboard viewModel={analytics.data} />
    </div>
  )
}
