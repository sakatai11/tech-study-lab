import 'server-only'

import { Badge } from '@/components/ui/badge'

import { loadReviewOnce } from '../load-review'

/**
 * ユーザー固有の due 件数。共有キャッシュには載せず、React cache() の
 * リクエスト内 dedupe だけを利用する（design.md 5.3、ADR-0013）。
 */
export async function ReviewDueBadge() {
  const { dueCount } = await loadReviewOnce()

  return <Badge className="border-red bg-red-bg text-red">{dueCount}問</Badge>
}
