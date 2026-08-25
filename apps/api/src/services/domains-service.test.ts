import { describe, expect, it, vi } from 'vitest'

import { type DomainStatsRow, getDomains } from './domains-service'

const row = (overrides: Partial<DomainStatsRow>): DomainStatsRow => ({
  domain: 'security',
  masteredQuestionCount: 1,
  totalQuestionCount: 2,
  topicCount: 1,
  lessonCount: 1,
  ...overrides,
})

describe('getDomains', () => {
  it('returns all four domains in configured order and zero-fills absent domains', async () => {
    const findDomainStats = vi
      .fn()
      .mockResolvedValue([
        row({ domain: 'backend', masteredQuestionCount: 2, totalQuestionCount: 3 }),
        row({ domain: 'security', masteredQuestionCount: 1, totalQuestionCount: 3 }),
      ])

    await expect(getDomains({ findDomainStats }, { userId: 'user-1' })).resolves.toEqual({
      domains: [
        {
          domain: 'security',
          masteredQuestionCount: 1,
          totalQuestionCount: 3,
          masteryRate: 33,
          topicCount: 1,
          lessonCount: 1,
        },
        {
          domain: 'frontend',
          masteredQuestionCount: 0,
          totalQuestionCount: 0,
          masteryRate: 0,
          topicCount: 0,
          lessonCount: 0,
        },
        {
          domain: 'backend',
          masteredQuestionCount: 2,
          totalQuestionCount: 3,
          masteryRate: 67,
          topicCount: 1,
          lessonCount: 1,
        },
        {
          domain: 'architecture',
          masteredQuestionCount: 0,
          totalQuestionCount: 0,
          masteryRate: 0,
          topicCount: 0,
          lessonCount: 0,
        },
      ],
    })
    expect(findDomainStats).toHaveBeenCalledWith('user-1')
  })

  it('rounds mastery rates and keeps zero totals at zero', async () => {
    const result = await getDomains(
      {
        findDomainStats: async () => [
          row({ domain: 'security', masteredQuestionCount: 0, totalQuestionCount: 0 }),
          row({ domain: 'frontend', masteredQuestionCount: 1, totalQuestionCount: 6 }),
        ],
      },
      { userId: 'user-1' },
    )

    expect(result.domains).toHaveLength(4)
    expect(result.domains[0]).toMatchObject({ domain: 'security', masteryRate: 0 })
    expect(result.domains[1]).toMatchObject({ domain: 'frontend', masteryRate: 17 })
  })
})
