import { DashboardShell } from '@/components/dashboard-shell'
import { ReviewDisplay } from '@/features/review/server/components/review-display'
import { loadReview } from '@/features/review/server/load-review'

export const dynamic = 'force-dynamic'

export default async function ReviewPage() {
  const viewModel = await loadReview()

  return (
    <DashboardShell>
      <ReviewDisplay viewModel={viewModel} />
    </DashboardShell>
  )
}
