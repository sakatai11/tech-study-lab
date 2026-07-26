import 'server-only'

import { TermCrumb } from '@/components/ui/term-crumb'

import type { QuizViewModel } from '../../view-model'

export function QuizHeader({ viewModel }: { viewModel: QuizViewModel }) {
  return (
    <header className="px-1 pt-1">
      <TermCrumb command={`quiz ${viewModel.lessonId} --api-grading`} />
      <p className="mb-0 mt-3 max-w-2xl text-sm leading-6 text-mute">
        正解データはクライアントへ渡さず、解答のたびに API で採点・記録します。
      </p>
    </header>
  )
}
