import type { PersistentWriteRateLimit } from './persistent-write-rate-limit'

type PersistentWriteLogEvent =
  | 'persistent_write_rate_limited'
  | 'persistent_write_rate_limit_unavailable'
  | 'persistent_write_succeeded'

/** Emits only stable operational fields; request and user identifiers are deliberately excluded. */
export function logPersistentWriteEvent(
  event: PersistentWriteLogEvent,
  rateLimit: PersistentWriteRateLimit,
): void {
  console.info(
    JSON.stringify({
      event,
      endpoint: rateLimit.endpoint,
      writeUnit: rateLimit.writeUnit,
    }),
  )
}
