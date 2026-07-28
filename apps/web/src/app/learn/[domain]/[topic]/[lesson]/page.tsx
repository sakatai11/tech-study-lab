import { notFound } from 'next/navigation'

import { DashboardShell } from '@/components/dashboard-shell'
import { LessonDisplay } from '@/features/lesson/server/components/lesson-display'
import { listLessonRouteParams, loadLesson } from '@/features/lesson/server/load-lesson'

type LessonPageProps = {
  params: Promise<{ domain: string; topic: string; lesson: string }>
}

// content 由来で API に依存しないため、Cache Components 有効時も全件を
// ビルド時に prerender する（design.md 7.1・8.2）
export function generateStaticParams() {
  return listLessonRouteParams()
}

export default async function LessonPage({ params }: LessonPageProps) {
  'use cache'

  const { domain, topic, lesson } = await params
  const viewModel = loadLesson(domain, topic, lesson)

  if (!viewModel) {
    notFound()
  }

  return (
    <DashboardShell>
      <LessonDisplay viewModel={viewModel} />
    </DashboardShell>
  )
}
