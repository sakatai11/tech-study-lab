import 'server-only'

import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { MaterialSymbol, type MaterialSymbolName } from '@/components/ui/material-symbol'
import { type Tone, toneChipClasses } from '@/components/ui/tone'

import type { DashboardActivityViewModel, DashboardViewModel } from '../../view-model'

const heatmapClasses = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4'] as const
const heatmapPathClasses = [
  'fill-heat-0 stroke-heat-0',
  'fill-heat-1 stroke-heat-1',
  'fill-heat-2 stroke-heat-2',
  'fill-heat-3 stroke-heat-3',
  'fill-heat-4 stroke-heat-4',
] as const

// 1セル = 10単位（塗り8 + 角を丸める stroke 1×2）、セル間の隙間 = 2単位。
const HEATMAP_ROWS = 7
const HEATMAP_PITCH = 12
const HEATMAP_CELL = 10

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

/**
 * 182日分のセルを濃さ別の5本の path にまとめる。セルごとに要素を作ると
 * RSC の serialize と SSR の HTML 化が Workers Free の CPU 上限を超えるため（Issue #220）。
 */
function heatmapPaths(days: DashboardViewModel['heatmap']['days']): string[] {
  const paths: string[] = heatmapPathClasses.map(() => '')
  days.forEach((day, index) => {
    const x = Math.floor(index / HEATMAP_ROWS) * HEATMAP_PITCH + 1
    const y = (index % HEATMAP_ROWS) * HEATMAP_PITCH + 1
    paths[heatmapLevel(day.answerCount)] += `M${x} ${y}h8v8h-8z`
  })
  return paths
}

function formatMonthDay(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

/**
 * SVG の代わりに読み上げる文。期間全体の要約に続けて、学習した日の日付と解答数を
 * 1つの文字列で並べる（0件の日は省く）。日ごとに要素を作らないのは、セルと同じく
 * RSC / SSR の CPU を増やさないため（Issue #220）。
 */
function heatmapSummary(days: DashboardViewModel['heatmap']['days']): string {
  let totalAnswers = 0
  let busiest: (typeof days)[number] | undefined
  const studied: string[] = []
  for (const day of days) {
    if (day.answerCount === 0) continue
    studied.push(`${formatMonthDay(day.date)} ${day.answerCount}問`)
    totalAnswers += day.answerCount
    if (!busiest || day.answerCount > busiest.answerCount) busiest = day
  }

  if (!busiest) return `直近${days.length}日間の学習記録はまだありません。`
  return `直近${days.length}日間で${studied.length}日学習し、合計${totalAnswers}問に解答しました。最も多かったのは${formatMonthDay(busiest.date)}の${busiest.answerCount}問です。学習した日：${studied.join('、')}。`
}

function activityDescription(activity: DashboardActivityViewModel): string {
  if (activity.type === 'lesson_viewed') {
    return `教材「${activity.lessonTitle ?? activity.lessonId}」を閲覧しました`
  }

  return activity.lessonTitle
    ? `問題に解答し、復習の予定を更新しました（${activity.lessonTitle}）`
    : '問題に解答し、復習の予定を更新しました'
}

// Intl.DateTimeFormat の生成は描画より重いため、アクティビティごとに作らず使い回す（Issue #220）。
const activityDateFormat = new Intl.DateTimeFormat('ja-JP', {
  day: 'numeric',
  month: 'numeric',
  timeZone: 'UTC',
})

function activityDate(occurredAt: number): string {
  return activityDateFormat.format(new Date(occurredAt))
}

function ActivityItem({ activity }: { activity: DashboardActivityViewModel }) {
  return (
    <li className="flex items-start gap-3 border-b border-border py-3 first:pt-0 last:border-0 last:pb-0">
      <span
        className={
          activity.type === 'answer_recorded'
            ? 'grid size-8 shrink-0 place-items-center rounded-lg bg-blue-bg text-blue'
            : 'grid size-8 shrink-0 place-items-center rounded-lg bg-green-bg text-green'
        }
      >
        <MaterialSymbol
          className="size-5"
          name={activity.type === 'answer_recorded' ? 'edit_note' : 'menu_book'}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-0 text-sm font-semibold text-ink-2">{activityDescription(activity)}</p>
        <p className="mb-0 mt-1 font-mono text-xs text-faint">
          {activityDate(activity.occurredAt)} ·{' '}
          {activity.type === 'answer_recorded' ? (activity.isCorrect ? '正解' : '不正解') : '閲覧'}
        </p>
      </div>
    </li>
  )
}

export function DashboardDataContent({ viewModel }: { viewModel: DashboardViewModel }) {
  const { summary, heatmap, activity } = viewModel
  const heatmapColumns = Math.max(1, Math.ceil(heatmap.days.length / HEATMAP_ROWS))

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="学習サマリー" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon="check_circle"
          label="正答率"
          value={String(summary.correctAnswerRate)}
          unit="%"
          tone="green"
        />
        <StatCard
          icon="timer"
          label="今週の学習時間"
          value={formatStudyTime(summary.thisWeekStudyTimeMs)}
          tone="blue"
        />
        <StatCard
          icon="local_fire_department"
          label="連続学習日数"
          value={String(summary.currentStreakDays)}
          unit="日"
          tone="orange"
        />
        <StatCard
          icon="verified"
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
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold text-blue hover:underline lg:hidden"
              href="/analytics"
            >
              学習分析を見る
              <MaterialSymbol className="size-5" name="chevron_right" />
            </Link>
            <Badge className="tabular-nums">{summary.currentStreakDays}日連続</Badge>
          </div>
        </div>
        <svg
          aria-hidden="true"
          className="heatmap mt-5 block h-auto w-full"
          strokeLinejoin="round"
          strokeWidth={2}
          viewBox={`0 0 ${heatmapColumns * HEATMAP_PITCH - (HEATMAP_PITCH - HEATMAP_CELL)} ${HEATMAP_ROWS * HEATMAP_PITCH - (HEATMAP_PITCH - HEATMAP_CELL)}`}
        >
          {heatmapPaths(heatmap.days).map((path, level) =>
            path ? (
              <path
                className={heatmapPathClasses[level]}
                d={path}
                key={heatmapPathClasses[level]}
              />
            ) : null,
          )}
        </svg>
        <p className="sr-only">{heatmapSummary(heatmap.days)}</p>
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
  icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: MaterialSymbolName
  label: string
  value: string
  unit?: string
  tone: Tone
}) {
  return (
    <Card className="reveal p-4">
      <span className={`grid size-10 place-items-center rounded-xl ${toneChipClasses[tone]}`}>
        <MaterialSymbol className="size-5" name={icon} />
      </span>
      <p className="mb-0 mt-4 font-mono text-2xl font-black tabular-nums text-ink">
        {value}
        {unit ? <span className="ml-1 text-sm text-mute">{unit}</span> : null}
      </p>
      <p className="mb-0 text-pretty text-sm text-mute">{label}</p>
    </Card>
  )
}
