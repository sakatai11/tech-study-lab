import { cn } from '@/lib/cn'

type ProgressBarProps = {
  className?: string
  label: string
  value: number
  color?: 'green' | 'blue' | 'purple' | 'orange'
}

const colorClasses = {
  green: 'bg-green',
  blue: 'bg-blue',
  purple: 'bg-purple',
  orange: 'bg-orange',
} as const

export function ProgressBar({ className, color = 'green', label, value }: ProgressBarProps) {
  const boundedValue = Math.min(100, Math.max(0, value))

  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={boundedValue}
      className={cn('h-3 overflow-hidden rounded-full border border-border bg-well', className)}
      role="progressbar"
      tabIndex={0}
    >
      <div
        className={cn('h-full rounded-full', colorClasses[color])}
        style={{ width: `${boundedValue}%` }}
      />
    </div>
  )
}
