import { notFound } from 'next/navigation'

import { DashboardShell } from '@/components/dashboard-shell'
import { TopicDisplay } from '@/features/lesson/server/components/topic-display'
import { loadTopic } from '@/features/lesson/server/load-topic'

type TopicPageProps = {
  params: Promise<{ domain: string; topic: string }>
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { domain, topic } = await params
  const viewModel = loadTopic(domain, topic)

  if (!viewModel) {
    notFound()
  }

  return (
    <DashboardShell>
      <TopicDisplay viewModel={viewModel} />
    </DashboardShell>
  )
}
