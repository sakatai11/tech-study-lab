import { DashboardShell } from '@/components/dashboard-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'

const stats = [
  { label: '今日の復習 due', value: '3', unit: '問', icon: '↻', tone: 'blue' },
  { label: '正答率 · 直近7日', value: '78', unit: '%', icon: '✓', tone: 'green' },
  { label: '基盤コンポーネント', value: '4', unit: '種', icon: '⌘', tone: 'purple' },
  { label: '連続学習ストリーク', value: '12', unit: '日', icon: '↗', tone: 'orange' },
] as const

const domains = [
  { label: 'Security', value: 42, color: 'green' },
  { label: 'Frontend', value: 68, color: 'blue' },
  { label: 'Backend', value: 31, color: 'purple' },
  { label: 'Architecture', value: 18, color: 'orange' },
] as const

const heatmap = Array.from({ length: 84 }, (_, index) => ({
  id: `sample-day-${index}`,
  level: (index * 7 + Math.floor(index / 4)) % 5,
}))

const heatmapClasses = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4'] as const

const statToneClasses = {
  blue: 'bg-blue-bg text-blue',
  green: 'bg-green-bg text-green',
  purple: 'bg-purple-bg text-purple',
  orange: 'bg-orange-bg text-orange',
} as const

export default function Home() {
  return (
    <DashboardShell>
      <div className="flex flex-col gap-5">
        <section className="flex flex-wrap items-start justify-between gap-4 px-1 pt-1">
          <div>
            <p className="m-0 font-mono text-xs font-bold text-green">~/devpath $ status</p>
            <h1 className="mb-0 mt-2 text-balance text-3xl font-black text-ink sm:text-4xl">
              開発者のための学習ワークベンチ
            </h1>
            <p className="mb-0 mt-2 max-w-2xl text-pretty text-mute">
              Dev-Native Neo Flat × Terminal
              の基盤を示す静的ダッシュボードです。実データ接続は次の縦切りで追加します。
            </p>
          </div>
          <Button disabled title="復習機能は準備中です" variant="green">
            復習は準備中
          </Button>
        </section>

        <section aria-label="学習サマリー" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {stats.map((stat) => (
            <Card className="p-4" key={stat.label}>
              <span
                aria-hidden="true"
                className={`grid size-10 place-items-center rounded-xl font-mono text-lg ${statToneClasses[stat.tone]}`}
              >
                {stat.icon}
              </span>
              <p className="mb-0 mt-4 font-mono text-2xl font-black tabular-nums text-ink">
                {stat.value}
                <span className="ml-1 text-sm text-mute">{stat.unit}</span>
              </p>
              <p className="mb-0 text-pretty text-sm text-mute">{stat.label}</p>
            </Card>
          ))}
        </section>

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-balance text-lg font-black text-ink">
                学習コントリビューション
              </h2>
              <p className="mb-0 mt-1 text-pretty text-sm text-mute">
                静的見本 · 実際の解答ログはまだ接続していません
              </p>
            </div>
            <Badge className="tabular-nums">12 day streak</Badge>
          </div>
          <div
            aria-label="84日間の学習コントリビューション見本"
            className="mt-5 grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto"
          >
            {heatmap.map((cell) => (
              <span
                aria-hidden="true"
                className={`size-3 rounded-sm ${heatmapClasses[cell.level]}`}
                key={cell.id}
              />
            ))}
          </div>
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

        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <h2 className="m-0 text-balance text-lg font-black text-ink">領域別の習得状況</h2>
            <p className="mb-0 mt-1 text-pretty text-sm text-mute">
              表示用サンプル。学習データには接続していません。
            </p>
            <div className="mt-5 flex flex-col gap-5">
              {domains.map((domain) => (
                <div key={domain.label}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="font-semibold text-ink-2">{domain.label}</span>
                    <span className="font-mono font-bold tabular-nums text-ink">
                      {domain.value}%
                    </span>
                  </div>
                  <ProgressBar
                    color={domain.color}
                    label={`${domain.label} の習得状況`}
                    value={domain.value}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="m-0 text-balance text-lg font-black text-ink">設計システムの状態</h2>
            <p className="mb-0 mt-1 text-pretty text-sm text-mute">
              基盤で提供するUI語彙を明示しています。
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Badge keycap="UI">Card</Badge>
              <Badge keycap="CTA">Button</Badge>
              <Badge keycap="1">Badge</Badge>
              <Badge keycap="%">ProgressBar</Badge>
            </div>
            <div className="mt-6 border-t-2 border-border pt-5">
              <p className="m-0 font-mono text-xs font-bold text-green">
                &gt;_ design-system --check
              </p>
              <p className="mb-0 mt-2 text-pretty text-sm leading-6 text-ink-2">
                dark/light tokens, responsive navigation, focus-visible, and safe-area support are
                ready.
              </p>
              <Badge className="mt-4 border-green bg-green-bg text-green">
                exit 0 · foundation ready
              </Badge>
            </div>
          </Card>
        </div>

        <Card className="border-green p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-4">
            <span
              aria-hidden="true"
              className="grid size-12 place-items-center rounded-2xl bg-green-bg font-mono text-xl text-green"
            >
              ▤
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 font-mono text-xs font-bold text-green">NEXT VERTICAL SLICE</p>
              <h2 className="mb-0 mt-1 text-balance text-xl font-black text-ink">
                教材 → 演習 → SRS の実データ連携
              </h2>
              <p className="mb-0 mt-1 text-pretty text-sm text-mute">
                この画面は、将来の機能を載せるための静的な基盤です。
              </p>
            </div>
            <Button disabled title="教材機能は準備中です" variant="green">
              教材は準備中
            </Button>
          </div>
        </Card>
      </div>
    </DashboardShell>
  )
}
