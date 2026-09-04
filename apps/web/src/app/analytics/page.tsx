import { AnalyticsPageContent } from '@/features/analytics/server/components/analytics-page-content'
import { AppShell } from '../_components/app-shell'

export default function AnalyticsPage() {
  return (
    <AppShell currentNavigation="analytics">
      <AnalyticsPageContent />
    </AppShell>
  )
}
