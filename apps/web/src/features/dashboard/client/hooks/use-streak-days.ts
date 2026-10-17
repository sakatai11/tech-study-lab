'use client'

import { useEffect, useState } from 'react'

import { createBrowserApiClient } from '@/lib/api'

import { fetchDashboardSummary } from '../../api/dashboard-api'

/** 静的ページの共通シェルでも、ユーザー固有のストリークはマウント後に取得する。 */
export function useStreakDays(): number | null {
  const [streakDays, setStreakDays] = useState<number | null>(null)

  useEffect(() => {
    let isActive = true

    async function loadStreak() {
      try {
        const summary = await fetchDashboardSummary(createBrowserApiClient())
        if (isActive) setStreakDays(summary.currentStreakDays)
      } catch {
        if (isActive) setStreakDays(null)
      }
    }

    void loadStreak()

    return () => {
      isActive = false
    }
  }, [])

  return streakDays
}
