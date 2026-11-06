import { ReviewDueBadge } from '@/features/review/client/components/review-due-badge'
import { ReviewQueueProvider } from '@/features/review/client/components/review-queue-provider'
import { ReviewUserContent } from '@/features/review/client/components/review-user-content'
import { ReviewPageShell } from '@/features/review/server/components/review-page-shell'
import { loadReviewQuestionIndex } from '@/features/review/server/load-review-index'
import { AppShell } from '../_components/app-shell'

// 静的な枠と loading 状態だけをビルド時に生成し、due queue はブラウザで取得する（ADR-0019）。
export default function ReviewPage() {
  return (
    <AppShell currentNavigation="review">
      <ReviewQueueProvider index={loadReviewQuestionIndex()}>
        <ReviewPageShell dueBadge={<ReviewDueBadge />}>
          <ReviewUserContent />
        </ReviewPageShell>
      </ReviewQueueProvider>
    </AppShell>
  )
}
