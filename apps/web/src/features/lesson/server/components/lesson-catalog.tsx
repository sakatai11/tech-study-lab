import 'server-only'

import type { DomainKey } from '@tsl/shared'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { MaterialSymbol } from '@/components/ui/material-symbol'
import { TermCrumb } from '@/components/ui/term-crumb'
import { domainIcons } from '@/features/shared/domain-icon'

import type { LessonCatalogViewModel } from '../../view-model'

const domainClassNames = {
  security: 'bg-green-bg text-green',
  frontend: 'bg-blue-bg text-blue',
  backend: 'bg-purple-bg text-purple',
  architecture: 'bg-orange-bg text-orange',
} satisfies Record<DomainKey, string>

export function LessonCatalog({ viewModel }: { viewModel: LessonCatalogViewModel }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="px-1 pt-1">
        <TermCrumb command="ls content/" />
        <div className="mt-4 flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl border-2 border-border bg-blue-bg text-blue">
            <MaterialSymbol className="size-7" name="menu_book" />
          </span>
          <h1 className="m-0 text-balance text-3xl font-black text-ink sm:text-4xl">教材一覧</h1>
        </div>
        <p className="mb-0 mt-3 max-w-2xl text-pretty text-mute">
          学びたいトピックを選んで、レッスンへ進みましょう。
        </p>
      </header>

      {viewModel.domains.map((domain) => (
        <section aria-labelledby={`catalog-${domain.domain}`} key={domain.domain}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-xl ${domainClassNames[domain.domain]}`}
              >
                <MaterialSymbol name={domainIcons[domain.domain]} />
              </span>
              <h2 className="m-0 text-xl font-black text-ink" id={`catalog-${domain.domain}`}>
                {domain.label}
              </h2>
            </div>
            <span className="text-sm text-mute">{domain.topics.length}トピック</span>
          </div>

          <Card>
            {domain.topics.length === 0 ? (
              <p className="m-0 flex items-start gap-3 px-5 py-5 text-sm text-mute sm:px-6">
                <MaterialSymbol className="mt-0.5 size-5" name="schedule" />
                <span>準備中 · 教材が追加されると、ここに表示されます。</span>
              </p>
            ) : (
              <ul className="m-0 list-none divide-y-2 divide-border p-0">
                {domain.topics.map((topic) => (
                  <li key={topic.topic}>
                    {topic.href ? (
                      <Link
                        className="flex min-h-11 items-center justify-between gap-4 rounded-xl px-5 py-5 text-ink transition-colors hover:bg-blue-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue sm:px-6"
                        href={topic.href}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <MaterialSymbol className="text-blue" name="menu_book" />
                          <div className="min-w-0">
                            <h3 className="m-0 break-words text-lg font-bold">{topic.title}</h3>
                            <p className="mb-0 mt-1 text-sm text-mute">
                              {topic.lessonCount}レッスン
                            </p>
                          </div>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-blue">
                          一覧へ
                          <MaterialSymbol className="size-5" name="chevron_right" />
                        </span>
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-6">
                        <div className="flex min-w-0 items-center gap-3 text-mute">
                          <MaterialSymbol name="menu_book" />
                          <h3 className="m-0 min-w-0 break-words text-lg font-bold">
                            {topic.title}
                          </h3>
                        </div>
                        <Badge className="shrink-0">準備中</Badge>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      ))}
    </div>
  )
}
