import 'server-only'

import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { MaterialSymbol } from '@/components/ui/material-symbol'
import { TermCrumb } from '@/components/ui/term-crumb'
import { cn } from '@/lib/cn'

import { LessonViewRecorder } from '../../client/components/lesson-view-recorder'
import type { LessonTocItemViewModel, LessonViewModel } from '../../view-model'
import { MarkdownTree } from './markdown-tree'

/**
 * 節が2つ以上あるときだけ出す。PC 幅だけに表示し、SP では出さない（docs/design-system.md）。
 * 追従する xl 以上ではビューポートに収め、長いときは目次内をスクロールさせる。
 */
function LessonToc({ items }: { items: LessonTocItemViewModel[] }) {
  return (
    <nav
      aria-labelledby="lesson-toc-title"
      className="lesson-toc hidden rounded-2xl border-2 border-border bg-surface p-4 lg:block xl:sticky xl:top-5 xl:col-start-2 xl:row-start-1 xl:max-h-[calc(100dvh-2.5rem)] xl:overflow-y-auto"
    >
      <p className="mb-2 mt-0 px-2 text-sm font-black text-ink" id="lesson-toc-title">
        目次
      </p>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((item) => (
          <li key={item.id}>
            <a
              className="block rounded-lg px-2 py-1.5 text-sm font-semibold leading-snug text-ink-2 hover:bg-well hover:text-ink"
              href={`#${item.id}`}
            >
              {item.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function LessonDisplay({ viewModel }: { viewModel: LessonViewModel }) {
  const hasToc = viewModel.toc.length >= 2
  return (
    <article className="flex flex-col gap-5">
      <LessonViewRecorder lessonId={viewModel.id} />
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
            {viewModel.questions.length}問 · 約{viewModel.estimatedMinutes}分
          </Badge>
        </div>
      </header>

      <div
        className={cn(
          'flex flex-col gap-5',
          hasToc && 'xl:grid xl:grid-cols-[minmax(0,1fr)_13rem] xl:items-start',
        )}
      >
        {hasToc ? <LessonToc items={viewModel.toc} /> : null}
        <Card className="min-w-0 p-5 sm:p-8 xl:col-start-1 xl:row-start-1">
          <div className="markdown-body max-w-3xl text-pretty text-ink-2">
            <MarkdownTree tree={viewModel.body} />
          </div>
        </Card>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-border bg-surface px-4 py-2.5 font-bold text-ink-2 shadow-[0_4px_0_var(--border)] transition-transform hover:border-border-hi hover:text-ink active:translate-y-1 active:shadow-none"
          href={`/learn/${viewModel.domain}/${viewModel.topic}`}
        >
          <MaterialSymbol className="size-5" name="arrow_back" />
          レッスン一覧
        </Link>
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green px-4 py-2.5 font-bold text-white shadow-[0_4px_0_var(--green-shade)] transition-transform hover:brightness-110 active:translate-y-1 active:shadow-none"
          href={`/quiz/${viewModel.id}`}
        >
          問題を解く
          <MaterialSymbol className="size-5" name="arrow_forward" />
        </Link>
      </footer>
    </article>
  )
}
