import { afterEach, describe, expect, it, vi } from 'vitest'

import { logPersistentWriteEvent } from './persistent-write-observability'
import { persistentWriteRateLimits } from './persistent-write-rate-limit'

describe('logPersistentWriteEvent', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits a PII-free structured event for a successful answer write', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    logPersistentWriteEvent('persistent_write_succeeded', persistentWriteRateLimits.answers)

    expect(info).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'persistent_write_succeeded',
        endpoint: 'POST /answers',
        writeUnit: 'answer_log_and_srs_state',
      }),
    )
  })
})
