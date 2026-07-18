import { cn } from '@/lib/cn'

type TermCrumbProps = {
  className?: string
  command: string
}

export function TermCrumb({ className, command }: TermCrumbProps) {
  return (
    <p className={cn('term-crumb', className)}>
      <span className="term-crumb-prompt">~/devpath $</span>
      <span>{command}</span>
      <span aria-hidden="true" className="term-cursor" />
    </p>
  )
}
