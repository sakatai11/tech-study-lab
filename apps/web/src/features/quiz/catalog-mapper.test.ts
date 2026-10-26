import { describe, expect, it } from 'vitest'

import type { BundledLesson, BundledTopic, DomainKey } from '@tsl/shared'

import { quizCatalogContentToViewModel } from './mapper'

function entry(domain: DomainKey, topic: string, order: number, ids = ['02', '01']) {
  const content: BundledTopic = {
    topic,
    title: `${topic}の基礎`,
    order,
    relativePath: `${domain}/${topic}/index.md`,
    body: '概要',
  }
  const lessons: BundledLesson[] = ids.map((id) => ({
    domain,
    topic,
    lessonId: `${domain}-${topic}-${id}`,
    title: `${topic}レッスン${id}`,
    estimatedMinutes: 10,
    relativePath: `${domain}/${topic}/${id}.md`,
    body: '本文',
    questions: [
      {
        id: `${domain}-${topic}-${id}-q1`,
        type: 'mcq',
        prompt: '問題',
        choices: ['A', 'B', 'C', 'D'],
        answerIndex: 0,
        explanation: '解説',
      },
    ],
  }))
  return { domain, content, lessons }
}

describe('quizCatalogContentToViewModel', () => {
  it('orders domains, topic order, topic identifiers and lesson IDs without mutating content', () => {
    const entries = [
      entry('architecture', 'design', 0),
      entry('backend', 'auth', 0),
      entry('security', 'xss', 2),
      entry('frontend', 'react', 0),
      entry('security', 'csrf', 2),
      entry('security', 'auth', 0),
    ]
    const original = structuredClone(entries)
    const viewModel = quizCatalogContentToViewModel(entries)

    expect(viewModel.domains.map(({ domain }) => domain)).toEqual([
      'security',
      'frontend',
      'backend',
      'architecture',
    ])
    expect(viewModel.domains[0]?.label).toBe('セキュリティ')
    expect(viewModel.domains[0]?.topics.map(({ topic }) => topic)).toEqual(['auth', 'csrf', 'xss'])
    expect(viewModel.domains[1]?.topics[0]).toEqual({
      topic: 'react',
      title: 'reactの基礎',
      lessons: ['01', '02'].map((id) => ({
        id: `frontend-react-${id}`,
        title: `reactレッスン${id}`,
        questionCount: 1,
        href: `/quiz/frontend-react-${id}`,
      })),
    })
    expect(entries).toEqual(original)
    expect(JSON.stringify(viewModel)).not.toMatch(/answerIndex|choices|explanation|本文/)
  })

  it('omits unstarted topics and empty domains so the empty state has no broken quiz links', () => {
    expect(quizCatalogContentToViewModel([])).toEqual({ domains: [] })
    expect(quizCatalogContentToViewModel([entry('frontend', 'react', 0, [])])).toEqual({
      domains: [],
    })
  })
})
