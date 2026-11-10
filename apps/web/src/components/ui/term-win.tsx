import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

type TermWinProps = {
  children: ReactNode
  className?: string
  meta?: string
  /** タイトルの右に置く状態表示（例: 教材の悪い例・良い例の FAIL / PASS）。 */
  status?: ReactNode
  title: string
}

export function TermWin({ children, className, meta, status, title }: TermWinProps) {
  return (
    <div className={cn('term-win', className)}>
      <div className="term-head">
        <span aria-hidden="true" className="term-badge">
          {'>_'}
        </span>
        <span className="term-title">{title}</span>
        {status ? <span className="term-status">{status}</span> : null}
        {meta ? <span className="term-meta">{meta}</span> : null}
      </div>
      {children}
    </div>
  )
}
