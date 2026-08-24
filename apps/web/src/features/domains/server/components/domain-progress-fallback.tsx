import { Card } from '@/components/ui/card'

export function DomainProgressFallback() {
  return (
    <section aria-busy="true" aria-labelledby="domain-progress-loading-heading">
      <h2 className="m-0 px-1 text-xl font-black text-ink" id="domain-progress-loading-heading">
        領域別の習得状況
      </h2>
      <Card className="mt-3 p-5 sm:p-6">
        <p className="m-0 text-sm font-semibold text-mute">学習データを読み込んでいます…</p>
      </Card>
    </section>
  )
}
