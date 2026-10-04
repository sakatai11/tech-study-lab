import 'server-only'

import { loadDashboard } from '../load-dashboard'
import { DashboardDataContent } from './dashboard-data-content'

export async function DashboardUserContent() {
  return <DashboardDataContent viewModel={await loadDashboard()} />
}
