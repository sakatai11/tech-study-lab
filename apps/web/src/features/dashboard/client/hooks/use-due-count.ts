'use client'

import { useEffect, useState } from 'react'

import type { DueCountResponse } from '@tsl/shared'

import { createBrowserApiClient } from '@/lib/api'

import { fetchDueCount } from '../../api/dashboard-api'

type DueCountSubscriptionOptions = {
  loadDueCount: () => Promise<DueCountResponse>
  onValue: (response: DueCountResponse | null) => void
}

/**
 * unmount 後の state 更新を防ぐ小さい副作用境界。失敗時はバッジ非表示を表す null を渡す。
 * React 非依存にして通信状態の契約を決定的に検証できるようにする。
 */
export function subscribeToDueCount({
  loadDueCount,
  onValue,
}: DueCountSubscriptionOptions): () => void {
  let isActive = true

  void loadDueCount()
    .then((response) => {
      if (isActive) {
        onValue(response)
      }
    })
    .catch(() => {
      if (isActive) {
        onValue(null)
      }
    })

  return () => {
    isActive = false
  }
}

async function loadBrowserDueCount(): Promise<DueCountResponse> {
  return fetchDueCount(createBrowserApiClient())
}

/** 静的ページの navigation badge 用。mount 後にだけ API を取得する。 */
export function useDueCount(): DueCountResponse | null {
  const [response, setResponse] = useState<DueCountResponse | null>(null)

  useEffect(
    () => subscribeToDueCount({ loadDueCount: loadBrowserDueCount, onValue: setResponse }),
    [],
  )

  return response
}
