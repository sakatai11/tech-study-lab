import 'server-only'

import { Card } from '@/components/ui/card'

/** due 件数の取得中に静的シェルへ表示するカード。 */
export function DashboardDueCardFallback() {
  return (
    <Card aria-busy="true" className="reveal border-blue p-5 sm:p-6">
      <p className="m-0 font-mono text-xs font-bold uppercase tracking-[0.18em] text-blue">
        today / review
      </p>
      <div className="mt-4 h-8 w-2/3 rounded-lg bg-well motion-safe:animate-pulse" />
      <div className="mt-3 h-5 w-1/2 rounded-lg bg-well motion-safe:animate-pulse" />
    </Card>
  )
}
