import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  keycap?: string
}

export function Badge({ children, className, keycap, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-border bg-well px-2.5 py-1.5 font-mono text-xs font-semibold text-ink-2',
        className,
      )}
      {...props}
    >
      {keycap ? (
        <span className="rounded-md border border-border border-b-2 bg-surface px-1.5 py-0.5 text-mute">
          {keycap}
        </span>
      ) : null}
      {children}
    </span>
  )
}
