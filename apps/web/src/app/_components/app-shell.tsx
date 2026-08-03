import type { ReactNode } from 'react'

import { DashboardShell } from '@/components/dashboard-shell'
import { DueCountBadge } from '@/features/dashboard/client/components/due-count-badge'

type AppShellProps = {
  children: ReactNode
}

/**
 * App Router の composition layer。全画面共通 shell と dashboard feature の
 * 復習バッジを props 契約で合成し、root components の feature 依存を防ぐ。
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <DashboardShell
      desktopReviewBadge={
        <DueCountBadge className="ml-auto grid size-5 place-items-center rounded-full bg-red font-mono text-[10px] font-bold tabular-nums text-white" />
      }
      mobileReviewBadge={
        <DueCountBadge className="absolute right-2 top-0 grid size-4 place-items-center rounded-full bg-red font-mono text-[9px] font-bold tabular-nums text-white" />
      }
    >
      {children}
    </DashboardShell>
  )
}
