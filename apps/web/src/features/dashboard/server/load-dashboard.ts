import 'server-only'

import { domainKeySchema } from '@tsl/shared'
import { connection } from 'next/server'

import { domainsToProgressData } from '@/features/shared/domain-progress'
import { createServerApiClient } from '@/lib/api'
import { getLessonContent, getLessonRouteParams, getOrderedTopicRoutes } from '@/lib/content'

import {
  fetchDashboardDomains,
  fetchDashboardHeatmap,
  fetchDashboardSummary,
  fetchDueCount,
  fetchRecentActivity,
} from '../api/dashboard-api'
import { dashboardToViewModel, dueCountToViewModel } from '../mapper'
import type {
  DashboardDueViewModel,
  DashboardStaticViewModel,
  DashboardViewModel,
} from '../view-model'

/** 静的シェルの「続きから」導線を、現在 bundle されている先頭レッスンへ解決する。 */
export function loadDashboardStatic(): DashboardStaticViewModel {
  const [firstLesson] = getLessonRouteParams()
  const firstLessonContent = firstLesson ? getLessonContent(firstLesson.lesson) : undefined
  const learnHref = firstLesson
    ? `/learn/${firstLesson.domain}/${firstLesson.topic}/${firstLesson.lesson}`
    : undefined

  return {
    continueHref: learnHref ?? '/home',
    learnHref,
    quizHref: firstLesson ? `/quiz/${firstLesson.lesson}` : undefined,
    ...(firstLessonContent
      ? {
          continueTitle: firstLessonContent.title,
          continueEstimatedMinutes: firstLessonContent.estimatedMinutes,
          continueQuestionCount: firstLessonContent.questions.length,
        }
      : {}),
  }
}

/**
 * ユーザー固有の due 件数を取得する非キャッシュ loader。
 * Cache Components 有効時は、Cloudflare context に触れる前にリクエスト時実行を宣言する。
 */
export async function loadDashboardDueCount(): Promise<DashboardDueViewModel> {
  await connection()

  return dueCountToViewModel(await fetchDueCount(await createServerApiClient()))
}

export async function loadDashboard(): Promise<DashboardViewModel> {
  await connection()
  const client = await createServerApiClient()
  const [summary, heatmap, domains, activity] = await Promise.all([
    fetchDashboardSummary(client),
    fetchDashboardHeatmap(client),
    fetchDashboardDomains(client),
    fetchRecentActivity(client),
  ])
  const topicRoutes = getOrderedTopicRoutes().flatMap((route) => {
    const result = domainKeySchema.safeParse(route.domain)
    return result.success ? [{ domain: result.data, topic: route.topic, order: route.order }] : []
  })
  const domainViewModel = domainsToProgressData(domains, topicRoutes)
  const lessonTitles = new Map(
    getLessonRouteParams().flatMap(({ lesson }) => {
      const content = getLessonContent(lesson)
      return content ? [[lesson, content.title] as const] : []
    }),
  )

  return dashboardToViewModel(summary, heatmap, domainViewModel, activity, lessonTitles)
}
