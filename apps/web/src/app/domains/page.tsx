import { Suspense } from 'react'

import { DomainProgressFallback } from '@/features/domains/server/components/domain-progress-fallback'
import { DomainProgressSection } from '@/features/domains/server/components/domain-progress-section'
import { loadDomains } from '@/features/domains/server/load-domains'
import { AppShell } from '../_components/app-shell'

async function DomainsUserContent() {
  try {
    const viewModel = await loadDomains()

    return <DomainProgressSection viewModel={viewModel} />
  } catch {
    return <DomainProgressFallback />
  }
}

export default function DomainsPage() {
  return (
    <AppShell currentNavigation="tree">
      <div className="flex flex-col gap-5">
        <header className="px-1 pt-1">
          <p className="mb-0 font-mono text-xs font-bold uppercase tracking-[0.18em] text-blue">
            skill tree
          </p>
          <h1 className="mb-0 mt-2 text-balance text-3xl font-black text-ink sm:text-4xl">
            学習領域
          </h1>
          <p className="mb-0 mt-2 max-w-2xl text-pretty text-mute">
            4つの領域から、次に読むトピックを選びましょう。
          </p>
        </header>
        <Suspense fallback={<DomainProgressFallback />}>
          <DomainsUserContent />
        </Suspense>
      </div>
    </AppShell>
  )
}
