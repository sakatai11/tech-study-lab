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

type Deferred<T> = {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T | PromiseLike<T>) => void
}

function createDeferred<T>(): Deferred<T> {
  let reject: Deferred<T>['reject'] = () => undefined
  let resolve: Deferred<T>['resolve'] = () => undefined
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, reject, resolve }
}

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

  it('ignores a successful response that completes after answers are reset', async () => {
    const pendingResponse = createDeferred<AnswerResponse>()
    postAnswerMock.mockReturnValueOnce(pendingResponse.promise)
    const { result } = renderHook(() => useAnswerSubmit())

    let submission: Promise<void>
    await act(async () => {
      submission = result.current.submitAnswer(input)
    })

    expect(result.current.submitting).toBe(true)

    act(() => {
      result.current.resetAnswers()
    })

    expect(result.current).toMatchObject({ error: undefined, results: {}, submitting: false })

    await act(async () => {
      pendingResponse.resolve(response)
      await submission
    })

    expect(result.current).toMatchObject({ error: undefined, results: {}, submitting: false })
  })

  it('ignores a failed response that completes after answers are reset', async () => {
    const pendingResponse = createDeferred<AnswerResponse>()
    postAnswerMock.mockReturnValueOnce(pendingResponse.promise)
    const { result } = renderHook(() => useAnswerSubmit())

    let submission: Promise<void>
    await act(async () => {
      submission = result.current.submitAnswer(input)
    })

    act(() => {
      result.current.resetAnswers()
    })

    await act(async () => {
      pendingResponse.reject(new Error('network error'))
      await submission
    })

    expect(result.current).toMatchObject({ error: undefined, results: {}, submitting: false })
  })

  it('keeps a new submission active when an earlier generation finishes', async () => {
    const firstResponse = createDeferred<AnswerResponse>()
    const secondResponse = createDeferred<AnswerResponse>()
    postAnswerMock
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise)
    const { result } = renderHook(() => useAnswerSubmit())

    let firstSubmission: Promise<void>
    await act(async () => {
      firstSubmission = result.current.submitAnswer(input)
    })

    act(() => {
      result.current.resetAnswers()
    })

    const secondInput: AnswerRequest = { questionId: 'question-2', selectedIndex: 0 }
    let secondSubmission: Promise<void>
    await act(async () => {
      secondSubmission = result.current.submitAnswer(secondInput)
    })

    await act(async () => {
      firstResponse.resolve(response)
      await firstSubmission
    })

    expect(result.current).toMatchObject({ error: undefined, results: {}, submitting: true })

    await act(async () => {
      secondResponse.resolve({ correctIndex: 0, isCorrect: true })
      await secondSubmission
    })

    expect(result.current).toMatchObject({
      error: undefined,
      results: {
        'question-2': { correctIndex: 0, isCorrect: true, selectedIndex: 0 },
      },
      submitting: false,
    })
  })
})
