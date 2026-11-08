import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

type TermWinProps = {
  children: ReactNode
  className?: string
  meta?: string
  title: string
}

export function TermWin({ children, className, meta, title }: TermWinProps) {
  return (
    <div className={cn('term-win', className)}>
      <div className="term-head">
        <span aria-hidden="true" className="term-badge">
          {'>_'}
        </span>
        <span className="term-title">{title}</span>
        {meta ? <span className="term-meta">{meta}</span> : null}
      </div>
      {children}
    </div>
  )
}
