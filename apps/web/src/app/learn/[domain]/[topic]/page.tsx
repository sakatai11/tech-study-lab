import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'

import { DashboardShell } from '@/components/dashboard-shell'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TermCrumb } from '@/components/ui/term-crumb'
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
      <div className="flex flex-col gap-5">
        <header className="px-1 pt-1">
          <TermCrumb command={`cd content/${viewModel.domain}/${viewModel.topic}`} />
          <p className="mb-0 mt-4 font-mono text-xs font-bold uppercase tracking-[0.18em] text-blue">
            topic index
          </p>
          <h1 className="mb-0 mt-2 text-balance text-3xl font-black text-ink sm:text-4xl">
            {viewModel.title}
          </h1>
          <div className="markdown-body mt-4 max-w-3xl text-pretty text-ink-2">
            <ReactMarkdown>{viewModel.overviewMarkdown}</ReactMarkdown>
          </div>
        </header>

        <section aria-labelledby="lesson-list-heading">
          <div className="mb-3 flex items-end justify-between gap-3 px-1">
            <div>
              <h2 className="m-0 text-xl font-black text-ink" id="lesson-list-heading">
                レッスン一覧
              </h2>
              <p className="mb-0 mt-1 text-sm text-mute">
                {viewModel.lessons.length} lesson{viewModel.lessons.length === 1 ? '' : 's'}
              </p>
            </div>
            <Badge className="border-green bg-green-bg text-green">content bundled</Badge>
          </div>

          <div className="grid gap-4">
            {viewModel.lessons.map((lesson, index) => (
              <Card className="p-5 sm:p-6" key={lesson.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="m-0 font-mono text-xs font-bold text-green">
                      {String(index + 1).padStart(2, '0')} · {lesson.id}
                    </p>
                    <h3 className="mb-0 mt-2 text-xl font-black text-ink">{lesson.title}</h3>
                    <p className="mb-0 mt-2 text-sm text-mute">{lesson.questionCount}問の演習</p>
                  </div>
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-blue bg-blue px-4 py-2.5 font-bold text-white shadow-[0_4px_0_var(--blue-shade)] transition-transform hover:brightness-110 active:translate-y-1 active:shadow-none"
                    href={`/learn/${viewModel.domain}/${viewModel.topic}/${lesson.id}`}
                  >
                    教材を読む →
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </DashboardShell>
  )
}
