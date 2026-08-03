import { notFound } from 'next/navigation'

import { TopicDisplay } from '@/features/lesson/server/components/topic-display'
import { listTopicRouteParams, loadTopic } from '@/features/lesson/server/load-topic'
import { AppShell } from '../../../_components/app-shell'

type TopicPageProps = {
  params: Promise<{ domain: string; topic: string }>
}

// content 由来で API に依存しないため、Cache Components 有効時も全件を
// ビルド時に prerender する（design.md 7.1・8.2）
export function generateStaticParams() {
  return listTopicRouteParams()
}

export default async function TopicPage({ params }: TopicPageProps) {
  'use cache'

  const { domain, topic } = await params
  const viewModel = loadTopic(domain, topic)

  if (!viewModel) {
    notFound()
  }

  return (
    <AppShell>
      <TopicDisplay viewModel={viewModel} />
    </AppShell>
  )
}
