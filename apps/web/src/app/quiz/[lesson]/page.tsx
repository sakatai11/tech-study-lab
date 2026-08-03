import { notFound } from 'next/navigation'

import { QuizInteractive } from '@/features/quiz/client/components/quiz-interactive'
import { QuizHeader } from '@/features/quiz/server/components/quiz-header'
import { listQuizRouteParams, loadQuiz } from '@/features/quiz/server/load-quiz'
import { AppShell } from '../../_components/app-shell'

type QuizPageProps = {
  params: Promise<{ lesson: string }>
}

// content 由来で API に依存しないため、Cache Components 有効時も全件を
// ビルド時に prerender する（design.md 7.1・8.2）
export function generateStaticParams() {
  return listQuizRouteParams()
}

export default async function QuizPage({ params }: QuizPageProps) {
  'use cache'

  const { lesson } = await params
  const viewModel = loadQuiz(lesson)

  if (!viewModel) {
    notFound()
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <QuizHeader viewModel={viewModel} />
        <QuizInteractive
          explanations={viewModel.explanations}
          nextLessonId={viewModel.nextLessonId}
          questions={viewModel.questions}
          resultHomeHref={`/learn/${viewModel.domain}/${viewModel.topic}`}
          resultHomeLabel="レッスン一覧へ"
          title={viewModel.title}
        />
      </div>
    </AppShell>
  )
}
