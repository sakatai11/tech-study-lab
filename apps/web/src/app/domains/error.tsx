'use client'

import { useEffect } from 'react'

import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { TermCrumb } from '@/components/ui/term-crumb'

export default function DomainsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-dvh bg-bg px-4 py-8">
      <main className="mx-auto max-w-3xl">
        <TermCrumb command="domains --check" />
        <Card className="mt-5 border-red p-6 sm:p-8">
          <p className="m-0 font-mono text-xs font-bold text-red">error: domains_unavailable</p>
          <h1 className="mb-0 mt-3 text-2xl font-black text-ink">学習領域を読み込めませんでした</h1>
          <p className="mb-0 mt-3 leading-7 text-ink-2">
            一時的な通信の問題が発生している可能性があります。再読み込みを試すか、ホームへ戻ってください。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={reset} variant="blue">
              再読み込み
            </Button>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-border px-4 py-2.5 font-bold text-ink transition-colors hover:bg-well"
              href="/home"
            >
              ホームへ
            </Link>
          </div>
        </Card>
      </main>
    </div>
  )
}
