import { Suspense } from 'react'

import { ReviewDueBadge } from '@/features/review/server/components/review-due-badge'
import { ReviewPageShell } from '@/features/review/server/components/review-page-shell'
import {
  ReviewDueBadgeFallback,
  ReviewQueueFallback,
} from '@/features/review/server/components/review-queue-fallback'
import { ReviewUserContent } from '@/features/review/server/components/review-user-content'
import { AppShell } from '../_components/app-shell'

export default function ReviewPage() {
  return (
    <AppShell>
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
    </AppShell>
  )
}
