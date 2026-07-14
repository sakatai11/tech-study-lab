import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

const variantClasses = {
  green:
    'bg-green text-white shadow-[0_4px_0_var(--green-shade)] hover:brightness-110 active:translate-y-1 active:shadow-none',
  blue: 'bg-blue text-white shadow-[0_4px_0_var(--blue-shade)] hover:brightness-110 active:translate-y-1 active:shadow-none',
  ghost:
    'border-2 border-border bg-surface text-ink-2 shadow-[0_4px_0_var(--border)] hover:border-border-hi hover:text-ink active:translate-y-1 active:shadow-none',
} as const

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variantClasses
}

export function Button({ className, variant = 'green', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-bold transition-transform duration-150 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:active:translate-y-0',
        variantClasses[variant],
        className,
      )}
      type={type}
      {...props}
    />
  )
}
