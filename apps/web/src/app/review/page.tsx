import { ReviewDueBadge } from '@/features/review/server/components/review-due-badge'
import { ReviewPageShell } from '@/features/review/server/components/review-page-shell'
import { ReviewUserContent } from '@/features/review/server/components/review-user-content'
import { AppShell } from '../_components/app-shell'

export const dynamic = 'force-dynamic'

export default async function ReviewPage() {
  // Both components call loadReviewOnce. React cache() keeps the request-local
  // queue read to one API request while normal SSR waits for the complete page.
  const [dueBadge, userContent] = await Promise.all([ReviewDueBadge(), ReviewUserContent()])

  return (
    <AppShell currentNavigation="review">
      <ReviewPageShell dueBadge={dueBadge}>{userContent}</ReviewPageShell>
    </AppShell>
  )
}
