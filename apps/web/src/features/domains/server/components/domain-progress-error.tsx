import { Card } from '@/components/ui/card'

export function DomainProgressError() {
  return (
    <section aria-labelledby="domain-progress-error-heading">
      <h2 className="m-0 px-1 text-xl font-black text-ink" id="domain-progress-error-heading">
        領域別の習得状況
      </h2>
      <Card className="mt-3 border-red p-5 sm:p-6">
        <p className="m-0 font-semibold text-ink">
          学習データを読み込めませんでした。時間をおいて再読み込みしてください。
        </p>
      </Card>
    </section>
  )
}
