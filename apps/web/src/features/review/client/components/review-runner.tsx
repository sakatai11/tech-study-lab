'use client'

import { QuizInteractive } from '@/features/quiz/client/components/quiz-interactive'

import type { ReviewViewModel } from '../../view-model'
import { ReviewIntro } from './review-intro'

/**
 * 次のバッチがある場合の完了操作でだけ queue を取得し直す（ADR-0019）。
 * batchKey が変わると QuizInteractive を作り直し、解答結果と画面フェーズを intro へ戻す。
 */
export function ReviewRunner({
  onNextBatch,
  viewModel,
}: {
  onNextBatch: () => void
  viewModel: ReviewViewModel
}) {
  return (
    <QuizInteractive
      key={viewModel.batchKey}
      eyebrowPrefix="review"
      explanations={viewModel.explanations}
      hasMore={viewModel.hasMore}
      introContent={<ReviewIntro dueCount={viewModel.dueCount} previews={viewModel.previews} />}
      introStartLabel="復習を開始"
      onComplete={() => {
        if (viewModel.hasMore) {
          onNextBatch()
        }
      }}
      questions={viewModel.questions}
      resultHomeHref={viewModel.resultHomeHref}
      resultHomeLabel={viewModel.resultHomeLabel}
      resultTitle="復習完了"
      title={viewModel.title}
    />
  )
}
