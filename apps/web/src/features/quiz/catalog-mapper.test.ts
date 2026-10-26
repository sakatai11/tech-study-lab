import { describe, expect, it } from 'vitest'

import type { BundledLesson, BundledTopic, DomainKey } from '@tsl/shared'

import { quizCatalogToViewModel } from './catalog-mapper'

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
    title: `レッスン${id}`,
    estimatedMinutes: 10,
    relativePath: `${domain}/${topic}/${id}.md`,
    body: '本文',
    questions: [
      {
        id: `${domain}-${topic}-${id}-q1`,
        type: 'mcq',
        prompt: '問題',
        choices: ['A', 'B'],
        answerIndex: 1,
        explanation: '解説',
      },
    ],
  }))
  return { domain, content, lessons }
}

describe('quizCatalogToViewModel', () => {
  it('sorts domains, topic order, topic identifier and lesson ID without mutating content', () => {
    const entries = [
      entry('architecture', 'design', 0),
      entry('security', 'xss', 2),
      entry('backend', 'auth', 0),
      entry('security', 'csrf', 2),
      entry('frontend', 'react', 0),
      entry('security', 'sql', 0),
    ]
    const original = structuredClone(entries)
    const vm = quizCatalogToViewModel(entries)
    expect(vm.domains.map(({ domain }) => domain)).toEqual([
      'security',
      'frontend',
      'backend',
      'architecture',
    ])
    expect(vm.domains[0]?.topics.map(({ topic }) => topic)).toEqual(['sql', 'csrf', 'xss'])
    expect(vm.domains[1]?.topics[0]).toEqual({
      topic: 'react',
      title: 'reactの基礎',
      lessons: [
        {
          lessonId: 'frontend-react-01',
          title: 'レッスン01',
          questionCount: 1,
          href: '/quiz/frontend-react-01',
        },
        {
          lessonId: 'frontend-react-02',
          title: 'レッスン02',
          questionCount: 1,
          href: '/quiz/frontend-react-02',
        },
      ],
    })
    expect(entries).toEqual(original)
  })

  it('omits empty topics and domains so they cannot produce broken exercise links', () => {
    expect(quizCatalogToViewModel([])).toEqual({ domains: [] })
    expect(quizCatalogToViewModel([entry('frontend', 'react', 0, [])])).toEqual({ domains: [] })
  })
})
