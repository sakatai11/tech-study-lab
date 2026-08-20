import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import type { AppEnv } from './env'
import { type PlatformRateLimiter, persistentWriteRateLimits } from './persistent-write-rate-limit'
import { guardPersistentWriteRateLimit } from './persistent-write-rate-limit-guard'

function createApp(limiter: PlatformRateLimiter) {
  return new Hono<AppEnv>()
    .use('*', async (c, next) => {
      c.set('userId', 'user-1')
      await next()
    })
    .post('/', async (c) => {
      const rateLimitResponse = await guardPersistentWriteRateLimit(
        c,
        persistentWriteRateLimits.answers,
        limiter,
      )

      return rateLimitResponse ?? c.json({ accepted: true })
    })
}

describe('guardPersistentWriteRateLimit', () => {
  it('returns the shared 429 contract with Retry-After when the limiter denies a write', async () => {
    const response = await createApp({
      async limit() {
        return { success: false }
      },
    }).request('https://api.test/', { method: 'POST' })

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    await expect(response.json()).resolves.toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too Many Requests' },
    })
  })

  it('returns the shared fail-closed 503 contract when the limiter is unavailable', async () => {
    const response = await createApp({
      async limit() {
        throw new Error('limiter unavailable')
      },
    }).request('https://api.test/', { method: 'POST' })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: { code: 'RATE_LIMIT_UNAVAILABLE', message: 'Rate limit unavailable' },
    })
  })

  it('continues to the route handler when the limiter allows a write', async () => {
    const response = await createApp({
      async limit() {
        return { success: true }
      },
    }).request('https://api.test/', { method: 'POST' })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ accepted: true })
  })
})
