import { describe, expect, it, vi } from 'vitest'

import { createClient } from '@tsl/api/client'

import { fetchDomains } from './domains-api'

const response = {
  domains: [
    {
      domain: 'security' as const,
      masteredQuestionCount: 0,
      totalQuestionCount: 0,
      masteryRate: 0,
      topicCount: 0,
      lessonCount: 0,
    },
    {
      domain: 'frontend' as const,
      masteredQuestionCount: 0,
      totalQuestionCount: 0,
      masteryRate: 0,
      topicCount: 0,
      lessonCount: 0,
    },
    {
      domain: 'backend' as const,
      masteredQuestionCount: 0,
      totalQuestionCount: 0,
      masteryRate: 0,
      topicCount: 0,
      lessonCount: 0,
    },
    {
      domain: 'architecture' as const,
      masteredQuestionCount: 0,
      totalQuestionCount: 0,
      masteryRate: 0,
      topicCount: 0,
      lessonCount: 0,
    },
  ],
}

describe('fetchDomains', () => {
  it('validates and returns the shared domains response', async () => {
    const client = createClient('https://api.example.test', {
      fetch: vi.fn().mockResolvedValue(Response.json(response)),
    })

    await expect(fetchDomains(client)).resolves.toEqual(response)
  })

  it('rejects a response with fewer than four domains', async () => {
    const client = createClient('https://api.example.test', {
      fetch: vi.fn().mockResolvedValue(Response.json({ domains: response.domains.slice(0, 3) })),
    })

    await expect(fetchDomains(client)).rejects.toThrow()
  })
})
