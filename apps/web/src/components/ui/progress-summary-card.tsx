import Link from 'next/link'
import type { ReactNode } from 'react'

import { Card } from './card'
import { ProgressBar } from './progress-bar'

export function ProgressSummaryCard({
  eyebrow,
  title,
  value,
  progressValue,
  color,
  progressLabel,
  detail,
  action,
}: {
  eyebrow: string
  title: string
  value: string
  progressValue: number
  color: 'green' | 'blue' | 'purple' | 'orange'
  progressLabel: string
  detail: ReactNode
  action: { href: string; label: string } | { disabledLabel: string }
}) {
  return (
    <Card className="flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 font-mono text-xs font-bold uppercase tracking-[0.16em] text-faint">
            {eyebrow}
          </p>
          <h3 className="mb-0 mt-2 text-xl font-black text-ink">{title}</h3>
        </div>
        <span className="font-mono text-2xl font-black tabular-nums text-ink">{value}</span>
      </div>
      <ProgressBar className="mt-5" color={color} label={progressLabel} value={progressValue} />
      <p className="mb-0 mt-3 text-sm text-mute">{detail}</p>
      <div className="mt-auto pt-5">
        {'href' in action ? (
          <Link
            className="inline-flex min-h-11 items-center font-bold text-blue underline-offset-4 hover:underline"
            href={action.href}
          >
            {action.label}
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex min-h-11 items-center font-semibold text-faint"
          >
            {action.disabledLabel}
          </span>
        )}
      </div>
    </Card>
  )
}
