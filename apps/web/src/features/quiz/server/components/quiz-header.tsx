import 'server-only'

import { TermCrumb } from '@/components/ui/term-crumb'

import type { QuizViewModel } from '../../view-model'

export function QuizHeader({ viewModel }: { viewModel: QuizViewModel }) {
  return (
    <header className="px-1 pt-1">
      <TermCrumb command={`quiz ${viewModel.lessonId} --api-grading`} />
    </header>
  )
}
