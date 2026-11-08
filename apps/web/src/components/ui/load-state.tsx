import Link from 'next/link'

import { Button } from './button'
import { Card } from './card'

const secondaryLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-border px-4 py-2.5 font-bold text-ink transition-colors hover:bg-well'

/**
 * ブラウザでの取得を待つ間の表示。静的に生成した HTML にも含まれるため、
 * 要素数を小さく保つ（ADR-0019）。
 */
export function LoadingCard({ label }: { label: string }) {
  return (
    <Card aria-busy="true" className="p-5 sm:p-6">
      <output className="block">
        <span className="block font-mono text-xs font-bold text-faint">loading…</span>
        <span className="mt-2 block text-sm font-semibold text-mute">{label}</span>
      </output>
    </Card>
  )
}

type LoadErrorCardProps = {
  code: string
  title: string
  message: string
  onRetry: () => void
  links: readonly { href: string; label: string }[]
}

/** 取得の失敗を表示し、再試行と、再試行ループに閉じ込めないための導線を出す。 */
export function LoadErrorCard({ code, title, message, onRetry, links }: LoadErrorCardProps) {
  return (
    <Card className="border-red p-6 sm:p-8" role="alert">
      <p className="m-0 font-mono text-xs font-bold text-red">error: {code}</p>
      <h2 className="mb-0 mt-3 text-2xl font-black text-ink">{title}</h2>
      <p className="mb-0 mt-3 leading-7 text-ink-2">{message}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={onRetry} variant="blue">
          再読み込み
        </Button>
        {links.map((link) => (
          <Link className={secondaryLinkClassName} href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </div>
    </Card>
  )
}

/**
 * 前回のデータを表示したまま、裏の取り直しに失敗したことを伝える。
 * 古いデータを最新と誤解させず、再試行の操作を残す（ADR-0019）。
 */
export function RefreshErrorNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 border-red p-4" role="alert">
      <p className="m-0 text-sm font-semibold text-ink-2">
        最新の内容を読み込めませんでした。前回の内容を表示しています。
      </p>
      <Button onClick={onRetry} variant="ghost">
        再読み込み
      </Button>
    </Card>
  )
}
