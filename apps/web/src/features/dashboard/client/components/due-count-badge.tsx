'use client'

import { useEffect, useState } from 'react'

import { createBrowserApiClient } from '@/lib/api'

import { fetchDueCount } from '../../api/dashboard-api'

type DueCountBadgeProps = {
  className: string
}

/**
 * 静的 prerender を維持するため、ブラウザでマウント後にだけ due 件数を取得する。
 * API 障害時はバッジを出さず、ナビゲーション自体を妨げない。
 */
export function DueCountBadge({ className }: DueCountBadgeProps) {
  const [dueCount, setDueCount] = useState<number | null>(null)

  useEffect(() => {
    let isMounted = true

    void (async () => {
      try {
        // Client は prerender 時ではなく、ブラウザで mount してから生成する。
        const { dueCount: nextDueCount } = await fetchDueCount(createBrowserApiClient())
        if (isMounted) {
          setDueCount(nextDueCount)
        }
      } catch {
        // ナビゲーションは静的シェルとして利用可能に保つ。
      }
    })()

    return () => {
      isMounted = false
    }
  }, [])

  if (!dueCount) {
    return null
  }

  return (
    <span className={className}>
      <span className="sr-only">期限の復習が</span>
      {dueCount}
      <span className="sr-only">件</span>
    </span>
  )
}
