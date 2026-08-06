// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AnswerRequest, AnswerResponse } from '@tsl/shared'

import { useAnswerSubmit } from './use-answer-submit'

const { createBrowserApiClientMock, postAnswerMock } = vi.hoisted(() => ({
  createBrowserApiClientMock: vi.fn(),
  postAnswerMock: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  createBrowserApiClient: createBrowserApiClientMock,
}))

vi.mock('../../api/quiz-api', () => ({
  submitAnswer: postAnswerMock,
}))

const browserClient = { source: 'browser' }
const input: AnswerRequest = { questionId: 'question-1', selectedIndex: 1 }
const response: AnswerResponse = { correctIndex: 1, isCorrect: true }

describe('useAnswerSubmit', () => {
  beforeEach(() => {
    createBrowserApiClientMock.mockReset()
    createBrowserApiClientMock.mockReturnValue(browserClient)
    postAnswerMock.mockReset()
    postAnswerMock.mockResolvedValue(response)
  })

  afterEach(() => {
    cleanup()
  })

  it('creates and reuses the browser client only after the first submission', async () => {
    const { result } = renderHook(() => useAnswerSubmit())

    expect(createBrowserApiClientMock).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.submitAnswer(input)
    })

    expect(createBrowserApiClientMock).toHaveBeenCalledTimes(1)
    expect(postAnswerMock).toHaveBeenNthCalledWith(1, browserClient, input)

    await act(async () => {
      await result.current.submitAnswer(input)
    })

    expect(createBrowserApiClientMock).toHaveBeenCalledTimes(1)
    expect(postAnswerMock).toHaveBeenNthCalledWith(2, browserClient, input)
  })
})
