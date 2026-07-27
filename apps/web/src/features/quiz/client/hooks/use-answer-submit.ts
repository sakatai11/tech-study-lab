'use client'

import type { AnswerRequest } from '@tsl/shared'
import { useCallback, useMemo, useRef, useState } from 'react'

import { createBrowserApiClient } from '@/lib/api'

import { submitAnswer as postAnswer } from '../../api/quiz-api'
import type { SubmittedAnswer } from '../../view-model'

export function useAnswerSubmit() {
  const client = useMemo(() => createBrowserApiClient(), [])
  const [error, setError] = useState<string>()
  const [results, setResults] = useState<Record<string, SubmittedAnswer>>({})
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const submitAnswer = useCallback(
    async (input: AnswerRequest) => {
      if (submittingRef.current) {
        return
      }

      submittingRef.current = true
      setSubmitting(true)
      setError(undefined)

      try {
        const response = await postAnswer(client, input)
        setResults((currentResults) => ({
          ...currentResults,
          [input.questionId]: {
            ...response,
            selectedIndex: input.selectedIndex,
          },
        }))
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : '解答の送信に失敗しました。')
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [client],
  )

  const resetAnswers = useCallback(() => {
    setError(undefined)
    setResults({})
  }, [])

  return { error, resetAnswers, results, submitAnswer, submitting }
}
