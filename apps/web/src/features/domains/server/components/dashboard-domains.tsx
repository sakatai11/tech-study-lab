import 'server-only'

import { loadDomains } from '../load-domains'
import { DomainProgressFallback } from './domain-progress-fallback'
import { DomainProgressSection } from './domain-progress-section'

/** Dashboard と /domains が同じ領域 ViewModel/Card を共有する動的表示。 */
export async function DashboardDomains() {
  try {
    return <DomainProgressSection viewModel={await loadDomains()} />
  } catch {
    return <DomainProgressFallback />
  }
}
