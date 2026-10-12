import { cn } from '@/lib/cn'

export type MaterialSymbolName =
  | 'security'
  | 'code'
  | 'dns'
  | 'account_tree'
  | 'menu_book'
  | 'chevron_right'
  | 'schedule'

type MaterialSymbolProps = {
  name: MaterialSymbolName
  className?: string
}

/** Official, self-hosted Material Symbols. Labels belong to the surrounding text. */
export function MaterialSymbol({ name, className }: MaterialSymbolProps) {
  const maskImage = `url(/icons/material-symbols/${name}.svg)`

  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-6 shrink-0 bg-current', className)}
      style={{
        maskImage,
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
        maskSize: 'contain',
        WebkitMaskImage: maskImage,
        WebkitMaskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
      }}
    />
  )
}
