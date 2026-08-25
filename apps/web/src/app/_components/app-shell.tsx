import type { ReactNode } from 'react'

import { DashboardShell, type NavigationSection } from '@/components/dashboard-shell'
import {
  DueCountBadge,
  DueCountProvider,
} from '@/features/dashboard/client/components/due-count-badge'
import { loadDashboardStatic } from '@/features/dashboard/server/load-dashboard'

type AppShellProps = {
  children: ReactNode
  currentNavigation: NavigationSection
}

/**
 * App Router の composition layer。全画面共通 shell と dashboard feature の
 * 復習バッジを props 契約で合成し、root components の feature 依存を防ぐ。
 */
export function AppShell({ children, currentNavigation }: AppShellProps) {
  const { learnHref, quizHref } = loadDashboardStatic()

  return (
    <DueCountProvider>
      <DashboardShell
        currentNavigation={currentNavigation}
        desktopReviewBadge={
          <DueCountBadge className="ml-auto grid size-5 place-items-center rounded-full bg-red font-mono text-[10px] font-bold tabular-nums text-white" />
        }
        mobileReviewBadge={
          <DueCountBadge className="absolute right-2 top-0 grid size-4 place-items-center rounded-full bg-red font-mono text-[9px] font-bold tabular-nums text-white" />
        }
        navigationHrefs={{
          dashboard: '/home',
          learn: learnHref,
          quiz: quizHref,
          review: '/review',
          tree: '/domains',
        }}
      >
        {children}
      </DashboardShell>
    </DueCountProvider>
  )
}
