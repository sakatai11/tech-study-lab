import { describe, expect, it, vi } from 'vitest'

import { createClient } from '@tsl/api/client'

import { fetchDashboardHeatmap, fetchDueCount, fetchRecentActivity } from './dashboard-api'

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

describe('dashboard data adapters', () => {
  it('validates the heatmap response through the shared contract', async () => {
    const days = Array.from({ length: 182 }, (_, index) => ({
      date: new Date(Date.parse('2026-03-04T00:00:00Z') + index * 86_400_000)
        .toISOString()
        .slice(0, 10),
      answerCount: 0,
    }))
    const client = createClient('https://api.example.test', {
      fetch: vi.fn().mockResolvedValue(Response.json({ days })),
    })

    await expect(fetchDashboardHeatmap(client)).resolves.toEqual({ days })
  })

  it('keeps missing activity lesson metadata as a nullable lesson ID', async () => {
    const response = {
      items: [
        {
          id: 'answer:1',
          type: 'answer_recorded',
          occurredAt: 1_700_000_000_000,
          questionId: 'question-1',
          lessonId: null,
          isCorrect: false,
        },
      ],
    }
    const client = createClient('https://api.example.test', {
      fetch: vi.fn().mockResolvedValue(Response.json(response)),
    })

    await expect(fetchRecentActivity(client)).resolves.toEqual(response)
  })
})
