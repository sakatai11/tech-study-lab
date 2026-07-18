import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

type TermWinProps = {
  children: ReactNode
  className?: string
  meta?: ReactNode
  title: string
}

export function TermWin({ children, className, meta, title }: TermWinProps) {
  return (
    <section className={cn('term-win', className)}>
      <header className="term-win-header">
        <span aria-hidden="true" className="term-win-badge">
          &gt;_
        </span>
        <span className="term-win-title">{title}</span>
        {meta ? <span className="term-win-meta">{meta}</span> : null}
      </header>
      <div className="term-win-body">{children}</div>
    </section>
  )
}
