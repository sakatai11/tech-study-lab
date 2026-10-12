import 'server-only'

import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TermCrumb } from '@/components/ui/term-crumb'

import type { LessonCatalogViewModel } from '../../view-model'

export function LessonCatalog({ viewModel }: { viewModel: LessonCatalogViewModel }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="px-1 pt-1">
        <TermCrumb command="ls content/" />
        <h1 className="mb-0 mt-4 text-balance text-3xl font-black text-ink sm:text-4xl">
          教材一覧
        </h1>
        <p className="mb-0 mt-3 max-w-2xl text-pretty text-mute">
          学びたいトピックを選んで、レッスンへ進みましょう。
        </p>
      </header>

      {viewModel.domains.map((domain) => (
        <section aria-labelledby={`catalog-${domain.domain}`} key={domain.domain}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="m-0 text-xl font-black text-ink" id={`catalog-${domain.domain}`}>
              {domain.label}
            </h2>
            <span className="text-sm text-mute">{domain.topics.length}トピック</span>
          </div>

          <Card>
            {domain.topics.length === 0 ? (
              <p className="m-0 px-5 py-5 text-sm text-mute sm:px-6">
                準備中 · 教材が追加されると、ここに表示されます。
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
                        <div className="min-w-0">
                          <h3 className="m-0 break-words text-lg font-bold">{topic.title}</h3>
                          <p className="mb-0 mt-1 text-sm text-mute">{topic.lessonCount}レッスン</p>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-blue">一覧へ</span>
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-6">
                        <h3 className="m-0 min-w-0 break-words text-lg font-bold text-mute">
                          {topic.title}
                        </h3>
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
