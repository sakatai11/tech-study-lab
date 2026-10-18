'use client'

import { useEffect, useState } from 'react'

import { createBrowserApiClient } from '@/lib/api'
import { subscribeToClientDataInvalidation } from '@/lib/client-data-invalidation'

import { fetchDashboardSummary } from '../../api/dashboard-api'

/** 静的ページの共通シェルでも、ユーザー固有のストリークはマウント後に取得する。 */
export function useStreakDays(): number | null {
  const [streakDays, setStreakDays] = useState<number | null>(null)

  useEffect(() => {
    let isActive = true
    let requestId = 0

    async function loadStreak() {
      const currentRequestId = ++requestId
      setStreakDays(null)
      try {
        const summary = await fetchDashboardSummary(createBrowserApiClient())
        if (isActive && currentRequestId === requestId) setStreakDays(summary.currentStreakDays)
      } catch {
        if (isActive && currentRequestId === requestId) setStreakDays(null)
      }
    }

    const unsubscribe = subscribeToClientDataInvalidation('study-activity', () => {
      void loadStreak()
    })
    void loadStreak()

    return () => {
      isActive = false
      unsubscribe()
    }
  }, [])

  return streakDays
}
