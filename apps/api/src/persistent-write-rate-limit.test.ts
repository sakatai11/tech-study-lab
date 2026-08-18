import { describe, expect, it } from 'vitest'

import {
  type PersistentWriteRateLimit,
  type PlatformRateLimiter,
  checkPersistentWriteRateLimit,
  createPersistentWriteRateLimitKey,
  persistentWriteRateLimits,
} from './persistent-write-rate-limit'

type Clock = {
  now(): number
}

class FixedClock implements Clock {
  constructor(private time: number) {}

  now(): number {
    return this.time
  }

  advance(milliseconds: number): void {
    this.time += milliseconds
  }
}

class FixedWindowRateLimiterFake implements PlatformRateLimiter {
  readonly keys: string[] = []
  private readonly counts = new Map<string, number>()

  constructor(
    private readonly rateLimit: PersistentWriteRateLimit,
    private readonly clock: Clock,
  ) {}

  async limit({ key }: { key: string }): Promise<{ success: boolean }> {
    this.keys.push(key)
    const window = Math.floor(this.clock.now() / this.rateLimit.windowSeconds / 1_000)
    const countKey = `${window}:${key}`
    const count = (this.counts.get(countKey) ?? 0) + 1
    this.counts.set(countKey, count)

    return { success: count <= this.rateLimit.limit }
  }
}

describe('persistent write rate limits', () => {
  it.each([persistentWriteRateLimits.answers, persistentWriteRateLimits.lessonViews])(
    '$endpoint allows N-1 and N requests, rejects N+1, then resets in the next window',
    async (rateLimit) => {
      const clock = new FixedClock(0)
      const limiter = new FixedWindowRateLimiterFake(rateLimit, clock)
      const userId = 'user-1'

      for (let request = 0; request < rateLimit.limit - 1; request += 1) {
        await expect(checkPersistentWriteRateLimit(limiter, userId, rateLimit)).resolves.toBe(
          'allowed',
        )
      }

      await expect(checkPersistentWriteRateLimit(limiter, userId, rateLimit)).resolves.toBe(
        'allowed',
      )
      await expect(checkPersistentWriteRateLimit(limiter, userId, rateLimit)).resolves.toBe(
        'limited',
      )

      clock.advance(rateLimit.windowSeconds * 1_000)

      await expect(checkPersistentWriteRateLimit(limiter, userId, rateLimit)).resolves.toBe(
        'allowed',
      )
    },
  )

  it('uses a stable endpoint discriminator in the platform key', async () => {
    const clock = new FixedClock(0)
    const answerLimiter = new FixedWindowRateLimiterFake(persistentWriteRateLimits.answers, clock)

    await checkPersistentWriteRateLimit(answerLimiter, 'user-1', persistentWriteRateLimits.answers)

    expect(answerLimiter.keys).toEqual([
      createPersistentWriteRateLimitKey('user-1', persistentWriteRateLimits.answers),
    ])
    expect(createPersistentWriteRateLimitKey('user-1', persistentWriteRateLimits.answers)).not.toBe(
      createPersistentWriteRateLimitKey('user-1', persistentWriteRateLimits.lessonViews),
    )
  })

  it('fails closed when the platform limiter is unavailable', async () => {
    const unavailableLimiter: PlatformRateLimiter = {
      limit: async () => {
        throw new Error('platform limiter unavailable')
      },
    }

    await expect(
      checkPersistentWriteRateLimit(
        unavailableLimiter,
        'user-1',
        persistentWriteRateLimits.answers,
      ),
    ).resolves.toBe('unavailable')
  })
})
