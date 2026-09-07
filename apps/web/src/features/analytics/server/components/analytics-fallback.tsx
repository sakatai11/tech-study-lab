import 'server-only'

import { Card } from '@/components/ui/card'

export function AnalyticsFallback() {
  return (
    <section aria-busy="true" aria-labelledby="analytics-loading-heading">
      <h2 className="m-0 px-1 text-xl font-black text-ink" id="analytics-loading-heading">
        学習分析を読み込んでいます…
      </h2>
      <Card className="mt-3 p-5 sm:p-6">
        <p className="m-0 text-sm font-semibold text-mute">集計データを取得しています…</p>
      </Card>
    </section>
  )
}
