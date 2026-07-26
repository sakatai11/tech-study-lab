import { notFound } from 'next/navigation'

import { DashboardShell } from '@/components/dashboard-shell'
import { LessonDisplay } from '@/features/lesson/server/components/lesson-display'
import { loadLesson } from '@/features/lesson/server/load-lesson'

type LessonPageProps = {
  params: Promise<{ domain: string; topic: string; lesson: string }>
}

export default async function LessonPage({ params }: LessonPageProps) {
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
