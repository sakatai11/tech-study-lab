import { describe, expect, it, vi } from 'vitest'

import type { DueCountResponse } from '@tsl/shared'

import { subscribeToDueCount } from './use-due-count'

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined
  let rejectPromise: ((reason?: unknown) => void) | undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  const resolve = (value: T) => {
    resolvePromise?.(value)
  }
  const reject = (reason?: unknown) => {
    rejectPromise?.(reason)
  }

  return { promise, reject, resolve }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('subscribeToDueCount', () => {
  it('publishes the loaded view model', async () => {
    const onValue = vi.fn()
    const response: DueCountResponse = { dueCount: 3 }

    subscribeToDueCount({ loadDueCount: () => Promise.resolve(response), onValue })
    await flushPromises()

    expect(onValue).toHaveBeenCalledTimes(1)
    expect(onValue).toHaveBeenCalledWith(response)
  })

  it('publishes null when loading fails so the badge remains hidden', async () => {
    const onValue = vi.fn()

    subscribeToDueCount({
      loadDueCount: () => Promise.reject(new Error('API unavailable')),
      onValue,
    })
    await flushPromises()

    expect(onValue).toHaveBeenCalledTimes(1)
    expect(onValue).toHaveBeenCalledWith(null)
  })

  it('does not publish after cleanup', async () => {
    const deferred = createDeferred<DueCountResponse>()
    const onValue = vi.fn()
    const unsubscribe = subscribeToDueCount({ loadDueCount: () => deferred.promise, onValue })

    unsubscribe()
    deferred.resolve({ dueCount: 1 })
    await flushPromises()

    expect(onValue).not.toHaveBeenCalled()
  })
})
