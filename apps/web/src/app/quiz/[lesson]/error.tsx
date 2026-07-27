'use client'

import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { TermCrumb } from '@/components/ui/term-crumb'

export default function QuizError({
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
        <TermCrumb command="quiz --check" />
        <Card className="mt-5 border-red p-6 sm:p-8">
          <p className="m-0 font-mono text-xs font-bold text-red">error: quiz_load_failed</p>
          <h1 className="mb-0 mt-3 text-2xl font-black text-ink">演習を読み込めませんでした</h1>
          <p className="mb-0 mt-3 leading-7 text-ink-2">
            一時的な問題の可能性があります。もう一度読み込んでください。
          </p>
          <Button className="mt-6" onClick={reset} variant="blue">
            再読み込み
          </Button>
        </Card>
      </main>
    </div>
  )
}
