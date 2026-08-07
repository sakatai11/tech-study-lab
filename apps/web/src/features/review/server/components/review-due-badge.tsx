import 'server-only'

import { Badge } from '@/components/ui/badge'

import { loadReviewOnce } from '../load-review'

/**
 * ユーザー固有の due 件数。<Suspense> の内側でのみ描画し、キャッシュしない
 * （`user_id` を共有キャッシュキーに含められないため。design.md 8.3）。
 */
export async function ReviewDueBadge() {
  const { dueCount } = await loadReviewOnce()

  return <Badge className="border-red bg-red-bg text-red">{dueCount} due</Badge>
}
