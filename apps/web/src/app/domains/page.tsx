import { DomainsPageContent } from '@/features/domains/server/components/domains-page-content'
import { AppShell } from '../_components/app-shell'

export const dynamic = 'force-dynamic'

export default function DomainsPage() {
  return (
    <AppShell currentNavigation="tree">
      <DomainsPageContent />
    </AppShell>
  )
}
