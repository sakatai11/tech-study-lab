import 'server-only'

import { Card } from '@/components/ui/card'

export function DashboardFallback() {
  return (
    <section aria-busy="true" aria-labelledby="dashboard-loading-heading">
      <h2 className="m-0 px-1 text-xl font-black text-ink" id="dashboard-loading-heading">
        学習データを読み込んでいます…
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {['summary', 'activity'].map((section) => (
          <Card className="p-5" key={section}>
            <div className="h-6 w-1/2 rounded-lg bg-well motion-safe:animate-pulse" />
            <div className="mt-4 h-20 rounded-lg bg-well motion-safe:animate-pulse" />
          </Card>
        ))}
      </div>
    </section>
  )
}
