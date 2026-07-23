'use client'

import { useRouter } from 'next/navigation'

import { QuizInteractive } from '@/features/quiz/components/quiz-interactive'

import type { ReviewViewModel } from '../view-model'
import { ReviewIntro } from './review-intro'

export function ReviewRunner({ viewModel }: { viewModel: ReviewViewModel }) {
  const router = useRouter()

  return (
    <QuizInteractive
      key={viewModel.batchKey}
      explanations={viewModel.explanations}
      hasMore={viewModel.hasMore}
      introContent={<ReviewIntro dueCount={viewModel.dueCount} previews={viewModel.previews} />}
      introStartLabel="復習を開始 →"
      onComplete={() => {
        if (viewModel.hasMore) {
          router.refresh()
        }
      }}
      questions={viewModel.questions}
      resultHomeHref={viewModel.resultHomeHref}
      resultHomeLabel={viewModel.resultHomeLabel}
      title={viewModel.title}
    />
  )
}
