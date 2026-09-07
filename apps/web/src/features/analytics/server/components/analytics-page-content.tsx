import 'server-only'

import { Suspense } from 'react'

import { AnalyticsDashboard } from '@/features/analytics/server/components/analytics-dashboard'
import { AnalyticsFallback } from '@/features/analytics/server/components/analytics-fallback'
import { loadAnalytics } from '@/features/analytics/server/load-analytics'

async function AnalyticsUserContent() {
  const viewModel = await loadAnalytics()
  return <AnalyticsDashboard viewModel={viewModel} />
}

export function AnalyticsPageContent() {
  return (
    <div className="flex flex-col gap-5">
      <header className="px-1 pt-1">
        <p className="mb-0 font-mono text-xs font-bold uppercase tracking-[0.18em] text-blue">
          analytics
        </p>
        <h1 className="mb-0 mt-2 text-balance text-3xl font-black text-ink sm:text-4xl">
          学習分析
        </h1>
        <p className="mb-0 mt-2 max-w-2xl text-pretty text-mute">
          解答ログとSRSの状態から、学習の進み方と弱点を確認しましょう。
        </p>
      </header>
      <Suspense fallback={<AnalyticsFallback />}>
        <AnalyticsUserContent />
      </Suspense>
    </div>
  )
}
