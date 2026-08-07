'use client'

import { type ReactNode, createContext, useContext } from 'react'

import { useDueCount } from '../hooks/use-due-count'

type DueCountBadgeProps = {
  className: string
}

type DueCountContextValue = ReturnType<typeof useDueCount>

const DueCountContext = createContext<DueCountContextValue | undefined>(undefined)

/** navigation内の複数バッジで、due件数の取得結果を共有する。 */
export function DueCountProvider({ children }: { children: ReactNode }) {
  const viewModel = useDueCount()

  return <DueCountContext.Provider value={viewModel}>{children}</DueCountContext.Provider>
}

function useSharedDueCount(): DueCountContextValue {
  const viewModel = useContext(DueCountContext)

  if (viewModel === undefined) {
    throw new Error('DueCountBadge must be rendered within DueCountProvider')
  }

  return viewModel
}

/**
 * 静的 prerender を維持するため、ブラウザでマウント後にだけ due 件数を取得する。
 * API 障害時はバッジを出さず、ナビゲーション自体を妨げない。
 */
export function DueCountBadge({ className }: DueCountBadgeProps) {
  const viewModel = useSharedDueCount()

  if (!viewModel?.dueCount) {
    return null
  }

  return (
    <span className={className}>
      <span className="sr-only">期限の復習が</span>
      {viewModel.dueCount}
      <span className="sr-only">件</span>
    </span>
  )
}
