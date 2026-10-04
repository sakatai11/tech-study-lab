import 'server-only'

import { Badge } from '@/components/ui/badge'

import { loadReviewOnce } from '../load-review'

/**
 * ユーザー固有の due 件数。共有キャッシュには載せず、React cache() の
 * リクエスト内 dedupe だけを利用する（design.md 8.3・9.2）。
 */
export async function ReviewDueBadge() {
  const { dueCount } = await loadReviewOnce()

  return <Badge className="border-red bg-red-bg text-red">{dueCount} due</Badge>
}
