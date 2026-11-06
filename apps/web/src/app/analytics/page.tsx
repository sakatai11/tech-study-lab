import { AnalyticsPageContent } from '@/features/analytics/server/components/analytics-page-content'
import { AppShell } from '../_components/app-shell'

// 静的な枠と loading 状態だけをビルド時に生成し、ユーザー固有データはブラウザで取得する（ADR-0019）。
export default function AnalyticsPage() {
  return (
    <AppShell currentNavigation="analytics">
      <AnalyticsPageContent />
    </AppShell>
  )
}
