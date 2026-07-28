import { Suspense } from 'react'

import { DashboardShell } from '@/components/dashboard-shell'
import { ReviewDueBadge } from '@/features/review/server/components/review-due-badge'
import { ReviewPageShell } from '@/features/review/server/components/review-page-shell'
import {
  ReviewDueBadgeFallback,
  ReviewQueueFallback,
} from '@/features/review/server/components/review-queue-fallback'
import { ReviewUserContent } from '@/features/review/server/components/review-user-content'

export default function ReviewPage() {
  return (
    <DashboardShell>
      <ReviewPageShell
        dueBadge={
          <Suspense fallback={<ReviewDueBadgeFallback />}>
            <ReviewDueBadge />
          </Suspense>
        }
      >
        <Suspense fallback={<ReviewQueueFallback />}>
          <ReviewUserContent />
        </Suspense>
      </ReviewPageShell>
    </DashboardShell>
  )
}
