import { cn } from '@/lib/cn'

/** Names of the official SVGs bundled in `public/icons/material-symbols/`. */
export const materialSymbolNames = [
  'security',
  'code',
  'dns',
  'account_tree',
  'menu_book',
  'chevron_right',
  'schedule',
  'home',
  'contract_edit',
  'event_repeat',
  'bar_chart',
  'category',
  'light_mode',
  'dark_mode',
  'check_circle',
  'cancel',
  'arrow_forward',
  'arrow_back',
  'local_fire_department',
  'timer',
  'verified',
  'edit_note',
  'speed',
] as const

export type MaterialSymbolName = (typeof materialSymbolNames)[number]

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
