import { DashboardPageContent } from '@/features/dashboard/server/components/dashboard-page-content'
import { AppShell } from '../_components/app-shell'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  return (
    <AppShell currentNavigation="dashboard">
      <DashboardPageContent />
    </AppShell>
  )
}
