import { emptyDomainsViewModel } from '../../mapper'
import { DomainProgressSection } from './domain-progress-section'

export function DomainProgressFallback() {
  return <DomainProgressSection viewModel={emptyDomainsViewModel()} />
}
