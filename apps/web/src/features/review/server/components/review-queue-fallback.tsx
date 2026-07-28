import 'server-only'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

/** queue 取得中に静的シェルへ描画する本文の fallback（design.md 9.2）。 */
export function ReviewQueueFallback() {
  return (
    <Card aria-busy="true" className="p-5 sm:p-7">
      <p className="m-0 font-mono text-xs font-bold text-ink-2">queue: loading...</p>
      <div className="mt-4 h-7 w-2/3 rounded-lg bg-well motion-safe:animate-pulse" />
      <div className="mt-3 h-5 w-1/2 rounded-lg bg-well motion-safe:animate-pulse" />
    </Card>
  )
}

/** ヘッダー右の due バッジ用 fallback。実データと同じ寸法を確保しレイアウトシフトを避ける。 */
export function ReviewDueBadgeFallback() {
  return <Badge aria-busy="true">-- due</Badge>
}
