import { describe, expect, it, vi } from 'vitest'

import { createClient } from '@tsl/api/client'

import { fetchDueCount } from './dashboard-api'

describe('fetchDueCount', () => {
  it('returns a response that satisfies the shared due-count contract', async () => {
    const client = createClient('https://api.example.test', {
      fetch: vi.fn().mockResolvedValue(Response.json({ dueCount: 4 })),
    })

    await expect(fetchDueCount(client)).resolves.toEqual({ dueCount: 4 })
  })

  it('rejects a response that violates the shared due-count contract', async () => {
    const client = createClient('https://api.example.test', {
      fetch: vi.fn().mockResolvedValue(Response.json({ dueCount: -1 })),
    })

    await expect(fetchDueCount(client)).rejects.toThrow()
  })
})
