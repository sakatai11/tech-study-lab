import { notFound } from 'next/navigation'

import { DashboardShell } from '@/components/dashboard-shell'
import { QuizInteractive } from '@/features/quiz/client/components/quiz-interactive'
import { QuizHeader } from '@/features/quiz/server/components/quiz-header'
import { loadQuiz } from '@/features/quiz/server/load-quiz'

type QuizPageProps = {
  params: Promise<{ lesson: string }>
}

export default async function QuizPage({ params }: QuizPageProps) {
  const { lesson } = await params
  const viewModel = loadQuiz(lesson)

  if (!viewModel) {
    notFound()
  }

  return (
    <DashboardShell>
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
    </DashboardShell>
  )
}
