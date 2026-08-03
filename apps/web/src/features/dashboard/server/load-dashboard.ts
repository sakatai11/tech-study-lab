import 'server-only'

import { connection } from 'next/server'

import { createServerApiClient } from '@/lib/api'
import { getLessonRouteParams } from '@/lib/content'

import { fetchDueCount } from '../api/dashboard-api'
import type { DashboardStaticViewModel } from '../view-model'

/** 静的シェルの「続きから」導線を、現在 bundle されている先頭レッスンへ解決する。 */
export function loadDashboardStatic(): DashboardStaticViewModel {
  const [firstLesson] = getLessonRouteParams()

  return {
    continueHref: firstLesson
      ? `/learn/${firstLesson.domain}/${firstLesson.topic}/${firstLesson.lesson}`
      : '/',
  }
}

/**
 * ユーザー固有の due 件数を取得する非キャッシュ loader。
 * Cache Components 有効時は、Cloudflare context に触れる前にリクエスト時実行を宣言する。
 */
export async function loadDashboardDueCount(): Promise<number> {
  await connection()

  const { dueCount } = await fetchDueCount(await createServerApiClient())
  return dueCount
}
