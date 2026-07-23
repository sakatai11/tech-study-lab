import { Card } from '@/components/ui/card'

import type { QuizQuestionViewModel, SubmittedAnswer } from '../view-model'

type QuestionCardProps = {
  explanation: string
  onAnswer: (selectedIndex: number) => void
  onNext: () => void
  question: QuizQuestionViewModel
  result?: SubmittedAnswer
  submitting: boolean
}

const choiceLabels = ['A', 'B', 'C', 'D', 'E', 'F']

export function QuestionCard({
  explanation,
  onAnswer,
  onNext,
  question,
  result,
  submitting,
}: QuestionCardProps) {
  const resultClassName = result?.isCorrect
    ? 'mt-5 rounded-xl border-2 border-green bg-green-bg p-4 text-green'
    : 'mt-5 rounded-xl border-2 border-red bg-red-bg p-4 text-red'

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="m-0 font-mono text-xs font-bold text-blue">{question.id}</p>
        <p className="m-0 font-mono text-xs text-mute">
          {result ? (result.isCorrect ? 'PASS' : 'FAIL') : 'WAITING FOR ANSWER'}
        </p>
      </div>

      <h2 className="mb-0 mt-4 text-xl font-black leading-8 text-ink sm:text-2xl">
        {question.prompt}
      </h2>

      <fieldset className="mt-6 grid gap-3" disabled={Boolean(result) || submitting}>
        <legend className="sr-only">解答を選択してください</legend>
        {question.choices.map((choice, index) => {
          const isCorrectChoice = result?.correctIndex === index
          const isSelectedChoice = result?.selectedIndex === index
          const className = result
            ? isCorrectChoice
              ? 'border-green bg-green-bg text-ink'
              : isSelectedChoice
                ? 'border-red bg-red-bg text-ink'
                : 'border-border bg-well text-mute'
            : 'border-border bg-well text-ink-2 hover:border-blue hover:bg-blue-bg'

          return (
            <button
              aria-label={`${String(index + 1)}番 ${choice}`}
              className={`flex min-h-12 items-start gap-3 rounded-xl border-2 px-4 py-3 text-left font-semibold transition-colors ${className}`}
              key={`${question.id}-${choice}`}
              onClick={() => onAnswer(index)}
              type="button"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-surface font-mono text-xs text-mute">
                {choiceLabels[index]}
              </span>
              <span className="pt-0.5">{choice}</span>
            </button>
          )
        })}
      </fieldset>

      {submitting ? (
        <output className="mb-0 mt-5 font-mono text-sm text-blue">&gt;_ grading...</output>
      ) : null}

      {result ? (
        <output aria-live="polite" className={resultClassName}>
          <span className="block font-bold">{result.isCorrect ? '正解です' : '不正解です'}</span>
          <span className="mt-2 block whitespace-pre-wrap text-sm leading-6 text-ink-2">
            {explanation}
          </span>
        </output>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue px-4 py-2.5 font-bold text-white shadow-[0_4px_0_var(--blue-shade)] transition-transform hover:brightness-110 active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
          disabled={!result || submitting}
          onClick={onNext}
          type="button"
        >
          次へ →
        </button>
      </div>
    </Card>
  )
}
