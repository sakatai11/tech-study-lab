import { AnalyticsPageContent } from '@/features/analytics/server/components/analytics-page-content'
import { AppShell } from '../_components/app-shell'

export const dynamic = 'force-dynamic'

export default function AnalyticsPage() {
  return (
    <AppShell currentNavigation="analytics">
      <AnalyticsPageContent />
    </AppShell>
  )
}
