'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { submitAnswer } from '../api/answers'
import type { QuizViewModel, SubmittedAnswer } from '../view-model'
import { QuestionCard } from './question-card'

type QuizPhase = 'intro' | 'exercise' | 'result'

type QuizInteractiveProps = {
  viewModel: QuizViewModel
}

export function QuizInteractive({ viewModel }: QuizInteractiveProps) {
  const [activeQuestions, setActiveQuestions] = useState(viewModel.questions)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [error, setError] = useState<string>()
  const [phase, setPhase] = useState<QuizPhase>('intro')
  const [results, setResults] = useState<Record<string, SubmittedAnswer>>({})
  const [submitting, setSubmitting] = useState(false)
  const [questionStartedAt, setQuestionStartedAt] = useState(0)

  const question = activeQuestions[currentIndex]
  const result = question ? results[question.id] : undefined

  useEffect(() => {
    if (phase === 'exercise' && question) {
      setQuestionStartedAt(Date.now())
    }
  }, [phase, question])

  const resetQuiz = (questions = viewModel.questions) => {
    setActiveQuestions(questions)
    setCurrentIndex(0)
    setError(undefined)
    setPhase('intro')
    setResults({})
  }

  const startWrongOnly = () => {
    const wrongQuestions = activeQuestions.filter((currentQuestion) => {
      const currentResult = results[currentQuestion.id]
      return currentResult ? !currentResult.isCorrect : false
    })
    setActiveQuestions(wrongQuestions)
    setCurrentIndex(0)
    setError(undefined)
    setPhase('exercise')
    setResults({})
  }

  const handleAnswer = useCallback(
    async (selectedIndex: number) => {
      if (!question || result || submitting) {
        return
      }

      setError(undefined)
      setSubmitting(true)

      try {
        const responseTimeMs = Math.max(0, Date.now() - (questionStartedAt || Date.now()))
        const response = await submitAnswer({
          questionId: question.id,
          responseTimeMs,
          selectedIndex,
        })
        setResults((currentResults) => ({
          ...currentResults,
          [question.id]: { ...response, selectedIndex },
        }))
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : '解答の送信に失敗しました。')
      } finally {
        setSubmitting(false)
      }
    },
    [question, result, submitting, questionStartedAt],
  )

  useEffect(() => {
    if (phase !== 'exercise' || !question || result || submitting) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const index = Number.parseInt(event.key, 10) - 1
      if (index < 0 || index >= question.choices.length) {
        return
      }

      event.preventDefault()
      void handleAnswer(index)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, question, result, submitting, handleAnswer])

  if (phase === 'intro') {
    return (
      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="m-0 font-mono text-xs font-bold uppercase tracking-[0.18em] text-blue">
              quiz / intro
            </p>
            <h1 className="mb-0 mt-3 text-2xl font-black text-ink sm:text-3xl">
              {viewModel.title}
            </h1>
          </div>
          <Badge className="border-purple bg-purple-bg text-purple">
            {activeQuestions.length}問
          </Badge>
        </div>
        <p className="mb-0 mt-5 leading-7 text-ink-2">
          1問ずつ解答し、APIで採点された結果と解説を確認します。選択肢表示からの反応時間も記録します。
        </p>
        <Button className="mt-6" onClick={() => setPhase('exercise')} variant="green">
          演習を開始 →
        </Button>
      </Card>
    )
  }

  if (phase === 'result') {
    const correctCount = activeQuestions.filter((currentQuestion) => {
      return results[currentQuestion.id]?.isCorrect
    }).length
    const wrongQuestions = activeQuestions.filter((currentQuestion) => {
      const currentResult = results[currentQuestion.id]
      return currentResult ? !currentResult.isCorrect : false
    })

    return (
      <Card className="p-5 sm:p-7">
        <p className="m-0 font-mono text-xs font-bold uppercase tracking-[0.18em] text-green">
          quiz / result
        </p>
        <h1 className="mb-0 mt-3 text-3xl font-black text-ink">演習完了</h1>
        <p className="mb-0 mt-3 text-ink-2">
          <span className="font-mono text-2xl font-black tabular-nums text-ink">
            {correctCount}/{activeQuestions.length}
          </span>{' '}
          問正解
        </p>
        <div className="mt-6 grid gap-2">
          {activeQuestions.map((currentQuestion) => {
            const currentResult = results[currentQuestion.id]
            return (
              <div
                className="flex items-center justify-between gap-3 rounded-xl border-2 border-border bg-well px-4 py-3"
                key={currentQuestion.id}
              >
                <span className="min-w-0 truncate font-mono text-xs text-ink-2">
                  {currentQuestion.id}
                </span>
                <Badge
                  className={
                    currentResult?.isCorrect
                      ? 'border-green bg-green-bg text-green'
                      : 'border-red bg-red-bg text-red'
                  }
                >
                  {currentResult?.isCorrect ? 'PASS' : 'FAIL'}
                </Badge>
              </div>
            )
          })}
        </div>
        {error ? (
          <p className="mb-0 mt-4 text-sm font-semibold text-red" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => resetQuiz()} variant="ghost">
            再挑戦
          </Button>
          <Button disabled={wrongQuestions.length === 0} onClick={startWrongOnly} variant="blue">
            間違えた問題だけ復習
          </Button>
          {viewModel.nextLessonId ? (
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-green px-4 py-2.5 font-bold text-white shadow-[0_4px_0_var(--green-shade)] transition-transform hover:brightness-110 active:translate-y-1 active:shadow-none"
              href={`/quiz/${viewModel.nextLessonId}`}
            >
              次のレッスンへ →
            </Link>
          ) : (
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-border bg-surface px-4 py-2.5 font-bold text-ink-2 shadow-[0_4px_0_var(--border)] transition-transform hover:border-border-hi hover:text-ink active:translate-y-1 active:shadow-none"
              href={`/learn/${viewModel.domain}/${viewModel.topic}`}
            >
              レッスン一覧へ
            </Link>
          )}
        </div>
      </Card>
    )
  }

  if (!question) {
    return null
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="m-0 font-mono text-xs font-bold uppercase tracking-[0.18em] text-blue">
            quiz / exercise
          </p>
          <p className="mb-0 mt-1 text-sm text-mute">
            問題 {currentIndex + 1} / {activeQuestions.length}
          </p>
        </div>
        <Badge className="border-blue bg-blue-bg text-blue">1–{question.choices.length} keys</Badge>
      </div>
      <QuestionCard
        explanation={viewModel.explanations[question.id] ?? '解説を取得できませんでした。'}
        onAnswer={handleAnswer}
        onNext={() => {
          if (currentIndex === activeQuestions.length - 1) {
            setPhase('result')
          } else {
            setCurrentIndex((current) => current + 1)
          }
        }}
        question={question}
        result={result}
        submitting={submitting}
      />
      {error ? (
        <p
          className="mb-0 mt-4 rounded-xl border-2 border-red bg-red-bg px-4 py-3 text-sm font-semibold text-red"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
