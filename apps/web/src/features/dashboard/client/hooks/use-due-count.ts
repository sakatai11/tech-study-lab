'use client'

import { useEffect, useState } from 'react'

import { createBrowserApiClient } from '@/lib/api'

import { fetchDueCount } from '../../api/dashboard-api'
import { dueCountToViewModel } from '../../mapper'
import type { DashboardDueViewModel } from '../../view-model'

type DueCountSubscriptionOptions = {
  loadDueCount: () => Promise<DashboardDueViewModel>
  onValue: (viewModel: DashboardDueViewModel | null) => void
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
    .then((viewModel) => {
      if (isActive) {
        onValue(viewModel)
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

async function loadBrowserDueCount(): Promise<DashboardDueViewModel> {
  const response = await fetchDueCount(createBrowserApiClient())
  return dueCountToViewModel(response)
}

/** 静的ページの navigation badge 用。mount 後にだけ API を取得する。 */
export function useDueCount(): DashboardDueViewModel | null {
  const [viewModel, setViewModel] = useState<DashboardDueViewModel | null>(null)

  useEffect(
    () => subscribeToDueCount({ loadDueCount: loadBrowserDueCount, onValue: setViewModel }),
    [],
  )

  return viewModel
}
