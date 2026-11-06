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

  it('returns to loading and then error on reload without a cache, even after success', async () => {
    const next = createDeferred<string>()
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('batch 1')
      .mockReturnValueOnce(next.promise)
    const { result } = renderHook(() => useClientQuery(load))
    await waitFor(() => expect(result.current.status).toBe('success'))

    act(() => result.current.reload())
    expect(result.current.status).toBe('loading')
    await act(async () => next.reject(new Error('offline')))

    expect(result.current).toMatchObject({ status: 'error', error: new Error('offline') })
  })

  describe('cache', () => {
    afterEach(() => vi.restoreAllMocks())

    it('shows the kept data immediately and does not refetch while it is fresh', async () => {
      const load = vi.fn(() => Promise.resolve('first'))
      const options = { cache: { key: 'fresh', maxAgeMs: 60_000 } }
      const first = renderHook(() => useClientQuery(load, options))
      await waitFor(() => expect(first.result.current.status).toBe('success'))
      first.unmount()

      const second = renderHook(() => useClientQuery(load, options))

      expect(second.result.current).toMatchObject({ status: 'success', data: 'first' })
      expect(load).toHaveBeenCalledTimes(1)
    })

    it('keeps showing old data while refetching it in the background after maxAge', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
      const next = createDeferred<string>()
      const load = vi
        .fn<() => Promise<string>>()
        .mockResolvedValueOnce('old')
        .mockReturnValueOnce(next.promise)
      const options = { cache: { key: 'expired', maxAgeMs: 60_000 } }
      const first = renderHook(() => useClientQuery(load, options))
      await waitFor(() => expect(first.result.current.status).toBe('success'))
      first.unmount()

      now.mockReturnValue(61_000)
      const second = renderHook(() => useClientQuery(load, options))

      expect(second.result.current).toMatchObject({ status: 'success', data: 'old' })
      expect(load).toHaveBeenCalledTimes(2)
      await act(async () => next.resolve('new'))
      expect(second.result.current).toMatchObject({ status: 'success', data: 'new' })
    })

    it('refetches on return after an invalidation that arrived while the screen was gone', async () => {
      const load = vi
        .fn<() => Promise<string>>()
        .mockResolvedValueOnce('before answer')
        .mockResolvedValueOnce('after answer')
      const options = {
        revalidateOn: ['study-activity'],
        cache: { key: 'invalidated', maxAgeMs: 60_000 },
      }
      const first = renderHook(() => useClientQuery(load, options))
      await waitFor(() => expect(first.result.current.status).toBe('success'))
      first.unmount()

      act(() => invalidateClientData('study-activity'))
      const second = renderHook(() => useClientQuery(load, options))

      expect(second.result.current).toMatchObject({ data: 'before answer' })
      await waitFor(() =>
        expect(second.result.current).toMatchObject({ status: 'success', data: 'after answer' }),
      )
      expect(load).toHaveBeenCalledTimes(2)
    })

    it('keeps the shown data when a background refetch fails', async () => {
      const load = vi
        .fn<() => Promise<string>>()
        .mockResolvedValueOnce('shown')
        .mockRejectedValueOnce(new Error('offline'))
      const { result } = renderHook(() =>
        useClientQuery(load, { cache: { key: 'failure', maxAgeMs: 60_000 } }),
      )
      await waitFor(() => expect(result.current.status).toBe('success'))

      act(() => result.current.reload())
      expect(result.current).toMatchObject({ status: 'success', data: 'shown' })
      await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
      expect(result.current).toMatchObject({ status: 'success', data: 'shown' })
    })
  })
})
