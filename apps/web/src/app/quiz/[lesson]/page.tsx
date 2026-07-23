import { notFound } from 'next/navigation'

import { DashboardShell } from '@/components/dashboard-shell'
import { TermCrumb } from '@/components/ui/term-crumb'
import { QuizInteractive } from '@/features/quiz/components/quiz-interactive'
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
        <header className="px-1 pt-1">
          <TermCrumb command={`quiz ${viewModel.lessonId} --api-grading`} />
          <p className="mb-0 mt-3 max-w-2xl text-sm leading-6 text-mute">
            正解データはクライアントへ渡さず、解答のたびに API で採点・記録します。
          </p>
        </header>
        <QuizInteractive viewModel={viewModel} />
      </div>
    </DashboardShell>
  )
}
