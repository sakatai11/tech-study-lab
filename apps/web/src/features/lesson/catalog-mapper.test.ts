import { describe, expect, it } from 'vitest'

import type { BundledTopic, DomainKey } from '@tsl/shared'

import { catalogContentToViewModel } from './mapper'

function entry(domain: DomainKey, topic: string, order: number, lessonCount = 1) {
  const content: BundledTopic = {
    topic,
    title: `${topic}の教材`,
    order,
    relativePath: `${domain}/${topic}/index.md`,
    body: 'トピックの概要',
  }
  return { domain, content, lessonCount }
}

describe('catalogContentToViewModel', () => {
  it('groups topics in the shared domain order and sorts topics by order then identifier', () => {
    const entries = [
      entry('architecture', 'design', 0),
      entry('security', 'xss', 2, 3),
      entry('frontend', 'react', 0, 2),
      entry('security', 'csrf', 2),
      entry('security', 'auth', 0),
    ]

    const viewModel = catalogContentToViewModel(entries)

    expect(viewModel.domains.map(({ domain, label }) => ({ domain, label }))).toEqual([
      { domain: 'security', label: 'セキュリティ' },
      { domain: 'frontend', label: 'フロントエンド' },
      { domain: 'backend', label: 'バックエンド' },
      { domain: 'architecture', label: 'アーキテクチャ' },
    ])
    expect(viewModel.domains[0]?.topics.map(({ topic }) => topic)).toEqual(['auth', 'csrf', 'xss'])
    expect(viewModel.domains[1]?.topics).toEqual([
      { topic: 'react', title: 'reactの教材', lessonCount: 2, href: '/learn/frontend/react' },
    ])
    expect(viewModel.domains[2]?.topics).toEqual([])
    expect(entries.map(({ content }) => content.topic)).toEqual([
      'design',
      'xss',
      'react',
      'csrf',
      'auth',
    ])
  })

  it('keeps empty domains and unstarted topics without links', () => {
    expect(catalogContentToViewModel([]).domains).toHaveLength(4)
    expect(catalogContentToViewModel([]).domains.every(({ topics }) => topics.length === 0)).toBe(
      true,
    )
    expect(
      catalogContentToViewModel([entry('frontend', 'react', 0, 0)]).domains[1]?.topics,
    ).toEqual([{ topic: 'react', title: 'reactの教材', lessonCount: 0 }])
  })
})
