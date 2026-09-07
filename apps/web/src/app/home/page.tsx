import { DashboardPageContent } from '@/features/dashboard/server/components/dashboard-page-content'
import { AppShell } from '../_components/app-shell'

export default function HomePage() {
  return (
    <AppShell currentNavigation="dashboard">
      <DashboardPageContent />
    </AppShell>
  )
}
