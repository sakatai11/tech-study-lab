import { notFound } from 'next/navigation'

import { LessonDisplay } from '@/features/lesson/server/components/lesson-display'
import { listLessonRouteParams, loadLesson } from '@/features/lesson/server/load-lesson'
import { AppShell } from '../../../../_components/app-shell'

type LessonPageProps = {
  params: Promise<{ domain: string; topic: string; lesson: string }>
}

// content 由来で API に依存しないため、generateStaticParams で全件を
// ビルド時に静的生成する（design.md 5.1、ADR-0013）。
export function generateStaticParams() {
  return listLessonRouteParams()
}

export default async function LessonPage({ params }: LessonPageProps) {
  const { domain, topic, lesson } = await params
  const viewModel = loadLesson(domain, topic, lesson)

  if (!viewModel) {
    notFound()
  }

  return (
    <AppShell currentNavigation="learn">
      <LessonDisplay viewModel={viewModel} />
    </AppShell>
  )
}
