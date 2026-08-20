import type { RateLimitUnavailableErrorResponse, RateLimitedErrorResponse } from '@tsl/shared'
import type { Context } from 'hono'

import type { AppEnv } from './env'
import { logPersistentWriteEvent } from './persistent-write-observability'
import {
  type PersistentWriteRateLimit,
  type PlatformRateLimiter,
  checkPersistentWriteRateLimit,
} from './persistent-write-rate-limit'

export async function guardPersistentWriteRateLimit(
  c: Context<AppEnv>,
  rateLimit: PersistentWriteRateLimit,
  limiter: PlatformRateLimiter,
) {
  const result = await checkPersistentWriteRateLimit(limiter, c.get('userId'), rateLimit)

  if (result === 'limited') {
    logPersistentWriteEvent('persistent_write_rate_limited', rateLimit)
    return c.json(
      {
        error: { code: 'RATE_LIMITED', message: 'Too Many Requests' },
      } satisfies RateLimitedErrorResponse,
      429,
      { 'Retry-After': '60' },
    )
  }

  if (result === 'unavailable') {
    logPersistentWriteEvent('persistent_write_rate_limit_unavailable', rateLimit)
    return c.json(
      {
        error: { code: 'RATE_LIMIT_UNAVAILABLE', message: 'Rate limit unavailable' },
      } satisfies RateLimitUnavailableErrorResponse,
      503,
    )
  }
}
