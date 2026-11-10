import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

import { MaterialSymbol, type MaterialSymbolName } from './material-symbol'

/**
 * 教材の callout の種別ごとの表示（docs/design-system.md の callout）。色だけで意味を示さないよう、ラベルを必ず表示する。
 * 色のクラス名は Tailwind が globals.css の components 層から取り除かないよう、組み立てずにリテラルで持つ。
 */
const calloutStyles = {
  note: { label: '補足', icon: 'info', className: 'callout-note' },
  tip: { label: 'ヒント', icon: 'lightbulb', className: 'callout-tip' },
  warning: { label: '注意', icon: 'warning', className: 'callout-warning' },
  caution: { label: '危険', icon: 'report', className: 'callout-caution' },
} as const satisfies Record<string, { label: string; icon: MaterialSymbolName; className: string }>

export type CalloutType = keyof typeof calloutStyles

export function isCalloutType(value: unknown): value is CalloutType {
  return typeof value === 'string' && Object.hasOwn(calloutStyles, value)
}

export function Callout({ children, type }: { children: ReactNode; type: CalloutType }) {
  const { label, icon, className } = calloutStyles[type]
  return (
    <div className={cn('callout', className)} data-callout={type} role="note">
      <p className="callout-title">
        <MaterialSymbol className="callout-icon size-5" name={icon} />
        {label}
      </p>
      {children}
    </div>
  )
}
