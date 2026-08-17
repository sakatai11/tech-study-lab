import Link from 'next/link'

import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TermCrumb } from '@/components/ui/term-crumb'

const learningSteps = [
  {
    command: 'content.read()',
    description: 'セキュリティ、フレームワーク、アーキテクチャを読み、設計の理由まで理解する。',
    label: '教材を読む',
  },
  {
    command: 'quiz.verify()',
    description: '4択で理解を確かめ、解説で判断の根拠を結び直す。',
    label: '4択で確かめる',
  },
  {
    command: 'srs.review()',
    description: '忘れかけた知識を適切な間隔で復習し、次の実装で使える状態にする。',
    label: 'SRSで復習する',
  },
] as const

export default function ProductTopPage() {
  return (
    <main className="min-h-dvh bg-bg px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-6xl">
        <header className="flex min-h-11 items-center justify-between gap-4 border-b-2 border-border pb-4">
          <Link className="min-w-0 font-black text-ink" href="/">
            tech-study-lab
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-green px-4 py-2.5 font-bold text-white shadow-[0_4px_0_var(--green-shade)] transition-transform hover:brightness-110 active:translate-y-1 active:shadow-none"
              href="/home"
            >
              ログイン
            </Link>
          </div>
        </header>

        <section className="grid gap-8 py-12 lg:grid-cols-2 lg:items-center lg:py-20">
          <div>
            <TermCrumb command="lab.boot --for individual-developers" />
            <Badge className="mt-5 border-green bg-green-bg text-green">
              AI-DRIVEN LEARNING LAB
            </Badge>
            <h1 className="mb-0 mt-5 max-w-3xl text-balance text-4xl font-black leading-tight text-ink sm:text-5xl">
              実装で使える知識を、学習ループで定着させる。
            </h1>
            <p className="mb-0 mt-5 max-w-2xl text-pretty text-lg leading-8 text-ink-2">
              tech-study-lab
              は、個人エンジニアがセキュリティ、フレームワーク、アーキテクチャを読み、確かめ、復習するための学習環境です。
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-green px-5 py-3 font-bold text-white shadow-[0_4px_0_var(--green-shade)] transition-transform hover:brightness-110 active:translate-y-1 active:shadow-none"
                href="/home"
              >
                ログインして学習を始める →
              </Link>
              <p className="m-0 text-pretty text-sm text-mute">ログイン情報の入力はありません</p>
            </div>
          </div>

          <Card className="overflow-hidden border-green">
            <div className="flex items-center justify-between gap-3 border-b-2 border-border bg-well px-4 py-3">
              <span className="font-mono text-xs font-bold text-green">learning-pipeline.ts</span>
              <span className="font-mono text-xs text-faint">ready</span>
            </div>
            <ol className="m-0 list-none divide-y-2 divide-border p-0">
              {learningSteps.map((step, index) => (
                <li className="grid gap-3 p-5 sm:grid-cols-2" key={step.command}>
                  <span className="font-mono text-sm font-bold tabular-nums text-green">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <p className="m-0 font-mono text-xs font-bold text-green">
                      &gt; {step.command}
                    </p>
                    <h2 className="mb-0 mt-2 text-balance text-xl font-black text-ink">
                      {step.label}
                    </h2>
                    <p className="mb-0 mt-2 text-pretty leading-7 text-mute">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </section>

        <section aria-labelledby="domains-heading" className="border-t-2 border-border py-8">
          <p className="m-0 font-mono text-xs font-bold text-green">LAB DOMAINS</p>
          <h2 className="mb-0 mt-2 text-balance text-2xl font-black text-ink" id="domains-heading">
            学んだことを、次の設計と実装へ。
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {['Security', 'Frontend / Backend', 'Architecture'].map((domain) => (
              <Card className="p-4" key={domain}>
                <p className="m-0 font-mono text-sm font-bold text-ink">{domain}</p>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
