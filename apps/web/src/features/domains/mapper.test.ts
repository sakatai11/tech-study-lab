import { describe, expect, it } from 'vitest'

import { domainsToViewModel, emptyDomainsViewModel } from './mapper'

const response = {
  domains: [
    {
      domain: 'security' as const,
      masteredQuestionCount: 1,
      totalQuestionCount: 2,
      masteryRate: 50,
      topicCount: 1,
      lessonCount: 1,
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

describe('domainsToViewModel', () => {
  it('adds labels and links only the first available topic for each domain', () => {
    expect(
      domainsToViewModel(response, [
        { domain: 'security', topic: 'xss' },
        { domain: 'security', topic: 'csrf' },
      ]).domains,
    ).toEqual([
      {
        ...response.domains[0],
        label: 'セキュリティ',
        firstTopicHref: '/learn/security/xss',
      },
      { ...response.domains[1], label: 'フロントエンド', firstTopicHref: undefined },
      { ...response.domains[2], label: 'バックエンド', firstTopicHref: undefined },
      { ...response.domains[3], label: 'アーキテクチャ', firstTopicHref: undefined },
    ])
  })

  it('creates four zero-filled cards for an API fallback', () => {
    expect(emptyDomainsViewModel().domains).toHaveLength(4)
    expect(emptyDomainsViewModel().domains.every((domain) => domain.masteryRate === 0)).toBe(true)
  })
})
