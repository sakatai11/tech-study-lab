import 'server-only'

import Link from 'next/link'
import type { CSSProperties } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

import type { DashboardActivityViewModel, DashboardViewModel } from '../../view-model'
import { DashboardDomainProgress } from './dashboard-domain-progress'

const heatmapClasses = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4'] as const

const statToneClasses = {
  blue: 'bg-blue-bg text-blue',
  green: 'bg-green-bg text-green',
  orange: 'bg-orange-bg text-orange',
  purple: 'bg-purple-bg text-purple',
} as const

function formatStudyTime(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000)
  const seconds = Math.floor((milliseconds % 60_000) / 1_000)
  if (minutes === 0) return `${seconds}秒`
  return seconds === 0 ? `${minutes}分` : `${minutes}分${seconds}秒`
}

function heatmapLevel(answerCount: number): number {
  if (answerCount >= 8) return 4
  if (answerCount >= 4) return 3
  if (answerCount >= 2) return 2
  return answerCount > 0 ? 1 : 0
}

function activityDescription(activity: DashboardActivityViewModel): string {
  if (activity.type === 'lesson_viewed') {
    return `教材「${activity.lessonTitle ?? activity.lessonId}」を閲覧しました`
  }

  return activity.lessonTitle
    ? `問題に回答して復習予定を更新しました（${activity.lessonTitle}）`
    : '問題に回答して復習予定を更新しました'
}

function activityDate(occurredAt: number): string {
  return new Intl.DateTimeFormat('ja-JP', {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(occurredAt))
}

function ActivityItem({ activity }: { activity: DashboardActivityViewModel }) {
  return (
    <li className="flex items-start gap-3 border-b border-border py-3 first:pt-0 last:border-0 last:pb-0">
      <span
        aria-hidden="true"
        className={
          activity.type === 'answer_recorded'
            ? 'grid size-8 shrink-0 place-items-center rounded-lg bg-blue-bg font-mono text-blue'
            : 'grid size-8 shrink-0 place-items-center rounded-lg bg-green-bg font-mono text-green'
        }
      >
        {activity.type === 'answer_recorded' ? '>' : '▤'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-0 text-sm font-semibold text-ink-2">{activityDescription(activity)}</p>
        <p className="mb-0 mt-1 font-mono text-xs text-faint">
          {activityDate(activity.occurredAt)} ·{' '}
          {activity.type === 'answer_recorded'
            ? activity.isCorrect
              ? '正解'
              : '不正解'
            : 'lesson_viewed'}
        </p>
      </div>
    </li>
  )
}

export function DashboardDataContent({ viewModel }: { viewModel: DashboardViewModel }) {
  const { summary, heatmap, domains, activity } = viewModel

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="学習サマリー" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="正答率" value={String(summary.correctAnswerRate)} unit="%" tone="green" />
        <StatCard
          label="今週の学習時間"
          value={formatStudyTime(summary.thisWeekStudyTimeMs)}
          tone="blue"
        />
        <StatCard
          label="連続学習ストリーク"
          value={String(summary.currentStreakDays)}
          unit="日"
          tone="orange"
        />
        <StatCard
          label="習得済み問題"
          value={String(summary.masteredQuestionCount)}
          unit="問"
          tone="purple"
        />
      </section>

      <Card className="reveal p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-balance text-lg font-black text-ink">
              学習コントリビューション
            </h2>
            <p className="mb-0 mt-1 text-pretty text-sm text-mute">直近26週 · UTC</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-blue hover:underline lg:hidden"
              href="/analytics"
            >
              すべて表示
            </Link>
            <Badge className="tabular-nums">{summary.currentStreakDays} day streak</Badge>
          </div>
        </div>
        <div aria-hidden="true" className="heatmap-grid mt-5 grid grid-flow-col grid-rows-7 gap-1">
          {heatmap.days.map((day, index) => (
            <span
              aria-hidden="true"
              className={`heatmap-cell rounded-sm ${heatmapClasses[heatmapLevel(day.answerCount)]}`}
              key={day.date}
              style={{ '--heatmap-index': index } as CSSProperties}
            />
          ))}
        </div>
        <ol aria-label="直近26週・182日間の学習コントリビューション" className="sr-only">
          {heatmap.days.map((day) => (
            <li key={day.date}>
              {day.date}: {day.answerCount}問
            </li>
          ))}
        </ol>
        <div className="mt-4 flex items-center justify-between gap-4 font-mono text-xs text-faint">
          <span>Less</span>
          <div aria-hidden="true" className="flex gap-1">
            {heatmapClasses.map((className) => (
              <span className={`size-3 rounded-sm ${className}`} key={className} />
            ))}
          </div>
          <span>More</span>
        </div>
      </Card>

      <DashboardDomainProgress domains={domains} />

      <Card className="p-5 sm:p-6" aria-labelledby="recent-activity-heading">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="m-0 font-mono text-xs font-bold uppercase tracking-[0.16em] text-blue">
              recent activity
            </p>
            <h2 className="mb-0 mt-2 text-xl font-black text-ink" id="recent-activity-heading">
              最近のアクティビティ
            </h2>
          </div>
          <span className="font-mono text-xs text-faint">最大10件</span>
        </div>
        {activity.length === 0 ? (
          <p className="mb-0 mt-5 rounded-xl bg-well p-4 text-sm font-semibold text-mute">
            まだ学習アクティビティがありません。
          </p>
        ) : (
          <ul className="m-0 mt-5 list-none p-0">
            {activity.map((item) => (
              <ActivityItem activity={item} key={item.id} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function StatCard({
  label,
  value,
  unit,
  tone,
}: {
  label: string
  value: string
  unit?: string
  tone: keyof typeof statToneClasses
}) {
  return (
    <Card className="reveal p-4">
      <span
        aria-hidden="true"
        className={`grid size-10 place-items-center rounded-xl font-mono text-lg ${statToneClasses[tone]}`}
      >
        #
      </span>
      <p className="mb-0 mt-4 font-mono text-2xl font-black tabular-nums text-ink">
        {value}
        {unit ? <span className="ml-1 text-sm text-mute">{unit}</span> : null}
      </p>
      <p className="mb-0 text-pretty text-sm text-mute">{label}</p>
    </Card>
  )
}
