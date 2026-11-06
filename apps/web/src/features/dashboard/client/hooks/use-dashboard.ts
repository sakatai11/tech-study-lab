'use client'

import { useCallback, useMemo } from 'react'

import { createBrowserApiClient } from '@/lib/api'
import {
  type ClientQueryResult,
  STATISTICS_MAX_AGE_MS,
  useClientQuery,
} from '@/lib/use-client-query'

import {
  fetchDashboardHeatmap,
  fetchDashboardSummary,
  fetchDueCount,
  fetchRecentActivity,
} from '../../api/dashboard-api'
import { dashboardToViewModel, dueCountToViewModel } from '../../mapper'
import type { DashboardScreenViewModel } from '../../view-model'

/**
 * /home のユーザー固有データを1つの hook で並列に取得し、状態を画面単位で1組にする。
 * 解答・閲覧の記録後は study-activity の無効化通知で取得し直す。画面へ戻ったときは
 * 前回のデータをすぐ表示し、保持期間を過ぎていれば裏で取り直す（ADR-0019）。
 */
export function useDashboard(
  lessonTitles: Readonly<Record<string, string>>,
): ClientQueryResult<DashboardScreenViewModel> {
  const titles = useMemo(() => new Map(Object.entries(lessonTitles)), [lessonTitles])
  const load = useCallback(async (): Promise<DashboardScreenViewModel> => {
    const client = createBrowserApiClient()
    const [due, summary, heatmap, activity] = await Promise.all([
      // 件数だけを取得できなくても、画面と復習への導線は出す。
      fetchDueCount(client).then(dueCountToViewModel, () => null),
      fetchDashboardSummary(client),
      fetchDashboardHeatmap(client),
      fetchRecentActivity(client),
    ])

    return { due, ...dashboardToViewModel(summary, heatmap, activity, titles) }
  }, [titles])

  return useClientQuery(load, {
    revalidateOn: ['study-activity'],
    cache: { key: 'dashboard', maxAgeMs: STATISTICS_MAX_AGE_MS },
  })
}
