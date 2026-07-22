'use client'

import { useRouter } from 'next/navigation'

import { QuizInteractive } from '@/features/quiz/components/quiz-interactive'

import type { ReviewViewModel } from '../view-model'

export function ReviewRunner({ viewModel }: { viewModel: ReviewViewModel }) {
  const router = useRouter()

  return (
    <QuizInteractive
      key={viewModel.batchKey}
      onComplete={() => {
        if (viewModel.hasNextBatch) {
          router.refresh()
        }
      }}
      viewModel={viewModel}
    />
  )
}
