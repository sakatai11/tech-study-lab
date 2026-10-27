import 'server-only'

import Link from 'next/link'

import { Card } from '@/components/ui/card'
import { MaterialSymbol } from '@/components/ui/material-symbol'
import { TermCrumb } from '@/components/ui/term-crumb'
import { toneChipClasses } from '@/components/ui/tone'
import { domainIcons, domainTones } from '@/features/shared/domain-icon'

import type { QuizCatalogViewModel } from '../../view-model'

export function QuizCatalog({ viewModel }: { viewModel: QuizCatalogViewModel }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="px-1 pt-1">
        <TermCrumb command="quiz / list" />
        <div className="mt-4 flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl border-2 border-border bg-blue-bg text-blue">
            <MaterialSymbol className="size-7" name="contract_edit" />
          </span>
          <h1 className="m-0 text-balance text-3xl font-black text-ink sm:text-4xl">演習一覧</h1>
        </div>
        <p className="mb-0 mt-3 max-w-2xl text-pretty text-mute">
          レッスンを選んで、学んだことを問題で確かめましょう。
        </p>
      </header>

      {viewModel.domains.length === 0 ? (
        <Card className="p-5 sm:p-6">
          <p className="mb-4 mt-0 text-mute">出題できる演習がありません。</p>
          <Link className="btn-ghost" href="/learn">
            <MaterialSymbol className="size-5" name="arrow_back" />
            教材一覧へ
          </Link>
        </Card>
      ) : (
        viewModel.domains.map((domain) => (
          <section aria-labelledby={`quiz-${domain.domain}`} key={domain.domain}>
            <div className="mb-3 flex items-center gap-3 px-1">
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneChipClasses[domainTones[domain.domain]]}`}
              >
                <MaterialSymbol name={domainIcons[domain.domain]} />
              </span>
              <h2 className="m-0 text-xl font-black text-ink" id={`quiz-${domain.domain}`}>
                {domain.label}
              </h2>
            </div>
            <div className="flex flex-col gap-4">
              {domain.topics.map((topic) => (
                <Card key={topic.topic}>
                  <h3 className="m-0 border-b-2 border-border px-5 py-4 text-lg font-bold text-ink sm:px-6">
                    {topic.title}
                  </h3>
                  <ul className="m-0 list-none divide-y-2 divide-border p-0">
                    {topic.lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <Link
                          className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-5 text-ink transition-colors hover:bg-blue-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue sm:px-6"
                          href={lesson.href}
                        >
                          <div className="min-w-0 flex-1 basis-48">
                            <h4 className="m-0 break-words font-bold">{lesson.title}</h4>
                            <p className="mb-0 mt-1 text-sm text-mute">{lesson.questionCount}問</p>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-blue">
                            演習へ
                            <MaterialSymbol className="size-5" name="arrow_forward" />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
