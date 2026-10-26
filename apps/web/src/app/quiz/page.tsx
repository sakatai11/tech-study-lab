import { QuizCatalog } from '@/features/quiz/server/components/quiz-catalog'
import { loadQuizCatalog } from '@/features/quiz/server/load-catalog'

import { AppShell } from '../_components/app-shell'

export default function QuizPage() {
  const viewModel = loadQuizCatalog()

  return (
    <AppShell currentNavigation="quiz">
      <QuizCatalog viewModel={viewModel} />
    </AppShell>
  )
}
