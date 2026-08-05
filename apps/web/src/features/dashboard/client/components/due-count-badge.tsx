'use client'

import { useDueCount } from '../hooks/use-due-count'

type DueCountBadgeProps = {
  className: string
}

/**
 * 静的 prerender を維持するため、ブラウザでマウント後にだけ due 件数を取得する。
 * API 障害時はバッジを出さず、ナビゲーション自体を妨げない。
 */
export function DueCountBadge({ className }: DueCountBadgeProps) {
  const viewModel = useDueCount()

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
