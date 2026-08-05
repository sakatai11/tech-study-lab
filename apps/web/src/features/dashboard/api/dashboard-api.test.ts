import { describe, expect, it, vi } from 'vitest'

import { createClient } from '@tsl/api/client'

import { fetchDueCount } from './dashboard-api'

describe('fetchDueCount', () => {
  it('calls the due-count endpoint and returns the shared-schema-validated response', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ dueCount: 4 }))
    const client = createClient('https://api.example.test', { fetch: fetcher })

    await expect(fetchDueCount(client)).resolves.toEqual({ dueCount: 4 })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/dashboard/due-count',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('rejects a response that violates the shared due-count contract', async () => {
    const client = createClient('https://api.example.test', {
      fetch: vi.fn().mockResolvedValue(Response.json({ dueCount: -1 })),
    })

    await expect(fetchDueCount(client)).rejects.toThrow()
  })
})
