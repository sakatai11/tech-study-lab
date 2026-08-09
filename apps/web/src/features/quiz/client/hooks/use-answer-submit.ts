'use client'

import type { AnswerRequest } from '@tsl/shared'
import { useCallback, useRef, useState } from 'react'

import { type ApiClient, createBrowserApiClient } from '@/lib/api'

import { submitAnswer as postAnswer } from '../../api/quiz-api'
import type { SubmittedAnswer } from '../../view-model'

export function useAnswerSubmit() {
  // クライアントの生成は最初の送信まで遅らせる。render 時に作ると SSR・prerender でも
  // 評価され、ブラウザ専用の設定（NEXT_PUBLIC_API_BASE_URL）が無い経路で throw する。
  const clientRef = useRef<ApiClient>(undefined)
  const [error, setError] = useState<string>()
  const [results, setResults] = useState<Record<string, SubmittedAnswer>>({})
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const generationRef = useRef(0)

  const submitAnswer = useCallback(async (input: AnswerRequest) => {
    if (submittingRef.current) {
      return
    }

    const generation = generationRef.current
    submittingRef.current = true
    setSubmitting(true)
    setError(undefined)

    try {
      clientRef.current ??= createBrowserApiClient()
      const response = await postAnswer(clientRef.current, input)
      if (generation === generationRef.current) {
        setResults((currentResults) => ({
          ...currentResults,
          [input.questionId]: {
            ...response,
            selectedIndex: input.selectedIndex,
          },
        }))
      }
    } catch (caughtError) {
      if (generation === generationRef.current) {
        setError(caughtError instanceof Error ? caughtError.message : '解答の送信に失敗しました。')
      }
    } finally {
      if (generation === generationRef.current) {
        submittingRef.current = false
        setSubmitting(false)
      }
    }
  }, [])

  const resetAnswers = useCallback(() => {
    generationRef.current += 1
    submittingRef.current = false
    setError(undefined)
    setResults({})
    setSubmitting(false)
  }, [])

  return { error, resetAnswers, results, submitAnswer, submitting }
}
