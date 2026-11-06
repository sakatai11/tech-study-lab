// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { invalidateClientData } from './client-data-invalidation'
import { useClientQuery } from './use-client-query'

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason?: unknown) => void = () => {}
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

describe('useClientQuery [ADR-0019]', () => {
  afterEach(cleanup)

  it('starts in the loading state and publishes the loaded data after mount', async () => {
    const { result } = renderHook(() => useClientQuery(() => Promise.resolve({ count: 3 })))

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current).toMatchObject({
      status: 'success',
      data: { count: 3 },
    })
  })

  it('publishes the error and loads again on reload', async () => {
    const load = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error('API unavailable'))
      .mockResolvedValueOnce(7)
    const { result } = renderHook(() => useClientQuery(load))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current).toMatchObject({
      error: new Error('API unavailable'),
    })

    act(() => result.current.reload())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current).toMatchObject({ status: 'success', data: 7 }))
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('loads again only for the subscribed invalidation keys', async () => {
    const load = vi.fn(() => Promise.resolve(1))
    renderHook(() => useClientQuery(load, { revalidateOn: ['study-activity'] }))
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))

    act(() => invalidateClientData('review-queue'))
    expect(load).toHaveBeenCalledTimes(1)

    act(() => invalidateClientData('study-activity'))
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  })

  it('does not reload on invalidation without a revalidation key', async () => {
    const load = vi.fn(() => Promise.resolve(1))
    renderHook(() => useClientQuery(load))
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))

    act(() => invalidateClientData('study-activity'))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('ignores a stale response that arrives after a newer request', async () => {
    const first = createDeferred<string>()
    const second = createDeferred<string>()
    const load = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useClientQuery(load))

    act(() => result.current.reload())
    await act(async () => second.resolve('new'))
    await act(async () => first.resolve('old'))

    expect(result.current).toMatchObject({ status: 'success', data: 'new' })
  })

  it('does not subscribe or publish after unmount', async () => {
    const deferred = createDeferred<number>()
    const load = vi.fn(() => deferred.promise)
    const { result, unmount } = renderHook(() =>
      useClientQuery(load, { revalidateOn: ['study-activity'] }),
    )

    unmount()
    await act(async () => deferred.resolve(1))
    act(() => invalidateClientData('study-activity'))

    expect(result.current.status).toBe('loading')
    expect(load).toHaveBeenCalledTimes(1)
  })
})
