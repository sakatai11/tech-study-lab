import { describe, expect, it } from 'vitest'

import {
  type PlatformRateLimiter,
  checkPersistentWriteRateLimit,
  createPersistentWriteRateLimitKey,
  persistentWriteRateLimits,
} from './persistent-write-rate-limit'

type Clock = {
  now(): number
}

type FixedWindowBoundary = {
  limit: number
  windowSeconds: 60
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
    private readonly boundary: FixedWindowBoundary,
    private readonly clock: Clock,
  ) {}

  async limit({ key }: { key: string }): Promise<{ success: boolean }> {
    this.keys.push(key)
    const window = Math.floor(this.clock.now() / this.boundary.windowSeconds / 1_000)
    const countKey = `${window}:${key}`
    const count = (this.counts.get(countKey) ?? 0) + 1
    this.counts.set(countKey, count)

    return { success: count <= this.boundary.limit }
  }
}

const rateLimitBoundaryFixtures = [
  {
    rateLimit: persistentWriteRateLimits.answers,
    boundary: { limit: 60, windowSeconds: 60 },
  },
  {
    rateLimit: persistentWriteRateLimits.lessonViews,
    boundary: { limit: 30, windowSeconds: 60 },
  },
] as const

describe('persistent write rate limits', () => {
  it.each(rateLimitBoundaryFixtures)(
    '$rateLimit.endpoint allows N-1 and N requests, rejects N+1, then resets in the next window',
    async ({ rateLimit, boundary }) => {
      const clock = new FixedClock(0)
      const limiter = new FixedWindowRateLimiterFake(boundary, clock)
      const userId = 'user-1'

      for (let request = 0; request < boundary.limit - 1; request += 1) {
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

      clock.advance(boundary.windowSeconds * 1_000)

      await expect(checkPersistentWriteRateLimit(limiter, userId, rateLimit)).resolves.toBe(
        'allowed',
      )
    },
  )

  it('uses a stable endpoint discriminator in the platform key', async () => {
    const clock = new FixedClock(0)
    const answerLimiter = new FixedWindowRateLimiterFake(
      rateLimitBoundaryFixtures[0].boundary,
      clock,
    )

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
