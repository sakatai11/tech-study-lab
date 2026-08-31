import 'server-only'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

import type { AnalyticsViewModel } from '../../view-model'

function formatStudyTime(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000)
  const seconds = Math.floor((milliseconds % 60_000) / 1_000)
  if (minutes === 0) return `${seconds}秒`
  return seconds === 0 ? `${minutes}分` : `${minutes}分${seconds}秒`
}

function formatResponseTime(milliseconds: number): string {
  return milliseconds >= 1_000
    ? `${(milliseconds / 1_000).toFixed(1).replace(/\.0$/, '')}秒`
    : `${milliseconds}ms`
}

export function AnalyticsDashboard({ viewModel }: { viewModel: AnalyticsViewModel }) {
  const { summary, weekly, mistakes } = viewModel
  const maxAnswerCount = Math.max(...weekly.map((day) => day.answerCount), 1)
  const retentionTotal =
    summary.retentionDistribution.masteredCount +
    summary.retentionDistribution.learningCount +
    summary.retentionDistribution.dueCount

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="学習サマリー" className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard label="総解答数" value={String(summary.totalAnswerCount)} unit="問" tone="blue" />
        <StatCard label="正答率" value={String(summary.correctAnswerRate)} unit="%" tone="green" />
        <StatCard
          label="平均反応時間"
          value={formatResponseTime(summary.averageResponseTimeMs)}
          tone="purple"
        />
        <StatCard
          label="習得済み問題"
          value={String(summary.masteredQuestionCount)}
          unit="問"
          tone="orange"
        />
        <StatCard
          label="連続学習"
          value={String(summary.currentStreakDays)}
          unit="日"
          tone="orange"
        />
      </section>

      <section aria-labelledby="weekly-activity-heading">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="m-0 font-mono text-xs font-bold uppercase tracking-[0.16em] text-blue">
                activity
              </p>
              <h2 className="mb-0 mt-2 text-xl font-black text-ink" id="weekly-activity-heading">
                週間アクティビティ
              </h2>
              <p className="mb-0 mt-1 text-sm text-mute">直近7日 · UTC</p>
            </div>
            <Badge className="border-green bg-green-bg text-green">
              学習時間 {formatStudyTime(summary.thisWeekStudyTimeMs)}
            </Badge>
          </div>
          <ul aria-label="直近7日の解答数" className="mt-6 grid grid-cols-7 items-end gap-2">
            {weekly.map((day) => (
              <li className="flex min-w-0 flex-col items-center gap-2" key={day.date}>
                <span className="font-mono text-xs font-bold tabular-nums text-ink">
                  {day.answerCount}
                </span>
                <div className="flex h-32 w-full items-end rounded-lg bg-well p-1">
                  <span
                    aria-hidden="true"
                    className="block w-full rounded-md bg-blue transition-[height]"
                    style={{
                      height: `${Math.max((day.answerCount / maxAnswerCount) * 100, day.answerCount ? 8 : 0)}%`,
                    }}
                  />
                </div>
                <span className="font-mono text-xs font-bold text-mute">{day.weekdayLabel}</span>
                <span className="sr-only">{day.date}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5 sm:p-6" aria-labelledby="retention-heading">
          <p className="m-0 font-mono text-xs font-bold uppercase tracking-[0.16em] text-purple">
            srs retention
          </p>
          <h2 className="mb-0 mt-2 text-xl font-black text-ink" id="retention-heading">
            SRS定着度分布
          </h2>
          <p className="mb-0 mt-1 text-sm text-mute">現在の復習状態を3区分で表示</p>
          <div className="mt-6 flex h-4 overflow-hidden rounded-full bg-well" aria-hidden="true">
            <span
              className="bg-green"
              style={{
                width: `${percentage(summary.retentionDistribution.masteredCount, retentionTotal)}%`,
              }}
            />
            <span
              className="bg-purple"
              style={{
                width: `${percentage(summary.retentionDistribution.learningCount, retentionTotal)}%`,
              }}
            />
            <span
              className="bg-red"
              style={{
                width: `${percentage(summary.retentionDistribution.dueCount, retentionTotal)}%`,
              }}
            />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
            <RetentionItem
              label="習得済み"
              value={summary.retentionDistribution.masteredCount}
              color="text-green"
            />
            <RetentionItem
              label="学習中"
              value={summary.retentionDistribution.learningCount}
              color="text-purple"
            />
            <RetentionItem
              label="復習期限"
              value={summary.retentionDistribution.dueCount}
              color="text-red"
            />
          </div>
        </Card>

        <Card className="p-5 sm:p-6" aria-labelledby="mistakes-heading">
          <p className="m-0 font-mono text-xs font-bold uppercase tracking-[0.16em] text-red">
            weak points
          </p>
          <h2 className="mb-0 mt-2 text-xl font-black text-ink" id="mistakes-heading">
            間違えやすい問題
          </h2>
          <p className="mb-0 mt-1 text-sm text-mute">2回答以上 · 誤答率の高い順</p>
          {mistakes.length === 0 ? (
            <p className="mb-0 mt-6 rounded-xl bg-well p-4 text-sm font-semibold text-mute">
              まだ十分な解答データがありません。
            </p>
          ) : (
            <ol className="m-0 mt-5 list-none space-y-3 p-0">
              {mistakes.map((mistake, index) => (
                <li className="flex items-center gap-3" key={mistake.questionId}>
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-red-bg font-mono text-xs font-bold text-red">
                    {index + 1}
                  </span>
                  <code className="min-w-0 flex-1 truncate font-mono text-sm text-ink-2">
                    {mistake.questionId}
                  </code>
                  <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-red">
                    {mistake.incorrectRate}%
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </section>
    </div>
  )
}

function percentage(value: number, total: number): number {
  return total === 0 ? 0 : Math.round((value / total) * 100)
}

function RetentionItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-well p-3">
      <p className={`m-0 font-mono text-xl font-black tabular-nums ${color}`}>{value}</p>
      <p className="mb-0 mt-1 text-xs text-mute">{label}</p>
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
  tone: 'blue' | 'green' | 'orange' | 'purple'
}) {
  const toneClasses = {
    blue: 'bg-blue-bg text-blue',
    green: 'bg-green-bg text-green',
    orange: 'bg-orange-bg text-orange',
    purple: 'bg-purple-bg text-purple',
  } as const

  return (
    <Card className="p-4">
      <span
        aria-hidden="true"
        className={`grid size-9 place-items-center rounded-xl font-mono font-bold ${toneClasses[tone]}`}
      >
        #
      </span>
      <p className="mb-0 mt-4 truncate font-mono text-2xl font-black tabular-nums text-ink">
        {value}
        {unit ? <span className="ml-1 text-sm text-mute">{unit}</span> : null}
      </p>
      <p className="mb-0 mt-1 text-pretty text-sm text-mute">{label}</p>
    </Card>
  )
}
