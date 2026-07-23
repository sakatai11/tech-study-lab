import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'

import { DashboardShell } from '@/components/dashboard-shell'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TermCrumb } from '@/components/ui/term-crumb'
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
      <article className="flex flex-col gap-5">
        <header className="px-1 pt-1">
          <TermCrumb
            command={`cat content/${viewModel.domain}/${viewModel.topic}/${viewModel.id}.md`}
          />
          <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-0 font-mono text-xs font-bold uppercase tracking-[0.18em] text-green">
                lesson
              </p>
              <h1 className="mb-0 mt-2 text-3xl font-black text-ink sm:text-4xl">
                {viewModel.title}
              </h1>
            </div>
            <Badge className="border-blue bg-blue-bg text-blue">
              {viewModel.questions.length}問 · markdown
            </Badge>
          </div>
        </header>

        <Card className="p-5 sm:p-8">
          <div className="markdown-body max-w-3xl text-pretty text-ink-2">
            <ReactMarkdown>{viewModel.markdownBody}</ReactMarkdown>
          </div>
        </Card>

        <footer className="flex flex-wrap items-center justify-between gap-3">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-border bg-surface px-4 py-2.5 font-bold text-ink-2 shadow-[0_4px_0_var(--border)] transition-transform hover:border-border-hi hover:text-ink active:translate-y-1 active:shadow-none"
            href={`/learn/${viewModel.domain}/${viewModel.topic}`}
          >
            ← レッスン一覧
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-green px-4 py-2.5 font-bold text-white shadow-[0_4px_0_var(--green-shade)] transition-transform hover:brightness-110 active:translate-y-1 active:shadow-none"
            href={`/quiz/${viewModel.id}`}
          >
            問題を解く →
          </Link>
        </footer>
      </article>
    </DashboardShell>
  )
}
