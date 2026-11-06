import 'server-only'

import { DOMAIN_LABELS, domainKeySchema } from '@tsl/shared'

import { getLessonContent, getLessonRouteParams, getOrderedTopicRoutes } from '@/lib/content'

import type { DashboardStaticViewModel } from '../view-model'

/**
 * 表示順（domain の order → topic の order → lessonId）で先頭のレッスンを返す。
 * bundle の並びは content/ のパス順なので、そのまま先頭を取ると表示順と食い違う。
 */
function findFirstLesson() {
  const topicOrders = new Map(
    getOrderedTopicRoutes().map((route) => [`${route.domain}/${route.topic}`, route.order]),
  )

  return getLessonRouteParams()
    .flatMap((lesson) => {
      const domain = domainKeySchema.safeParse(lesson.domain)
      return domain.success
        ? [
            {
              lesson,
              domainOrder: DOMAIN_LABELS[domain.data].order,
              topicOrder:
                topicOrders.get(`${lesson.domain}/${lesson.topic}`) ?? Number.POSITIVE_INFINITY,
            },
          ]
        : []
    })
    .sort(
      (a, b) =>
        a.domainOrder - b.domainOrder ||
        a.topicOrder - b.topicOrder ||
        a.lesson.topic.localeCompare(b.lesson.topic, 'en') ||
        a.lesson.lesson.localeCompare(b.lesson.lesson, 'en'),
    )[0]?.lesson
}

/** 静的シェルの「続きから」導線を、表示順で先頭のレッスンへ解決する。 */
export function loadDashboardStatic(): DashboardStaticViewModel {
  const firstLesson = findFirstLesson()
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
 * 最近のアクティビティに出すレッスン名。content 由来の静的データとして、
 * ビルド時に page から Client へ props で渡す（ADR-0019）。
 */
export function loadLessonTitles(): Record<string, string> {
  return Object.fromEntries(
    getLessonRouteParams().flatMap(({ lesson }) => {
      const content = getLessonContent(lesson)
      return content ? [[lesson, content.title] as const] : []
    }),
  )
}
