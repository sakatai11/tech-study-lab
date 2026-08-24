// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { DomainProgressCard } from './domain-progress-card'
import { DomainProgressError } from './domain-progress-error'
import { DomainProgressFallback } from './domain-progress-fallback'

const security = {
  domain: 'security' as const,
  label: 'セキュリティ',
  masteredQuestionCount: 1,
  totalQuestionCount: 2,
  masteryRate: 50,
  topicCount: 1,
  lessonCount: 1,
  firstTopicHref: '/learn/security/xss',
}

describe('DomainProgressCard', () => {
  afterEach(cleanup)

  it('shows API mastery values and links to the current first topic', () => {
    render(<DomainProgressCard domain={security} />)

    expect(screen.getByRole('heading', { name: 'セキュリティ' })).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText('1 / 2 問習得 · 1 topic · 1 lesson')).toBeTruthy()
    expect(screen.getByRole('link', { name: '最初のトピック →' })).toHaveProperty(
      'href',
      'http://localhost:3000/learn/security/xss',
    )
  })

  it('renders a non-link preparation state when content is unavailable', () => {
    render(<DomainProgressCard domain={{ ...security, firstTopicHref: undefined }} />)

    expect(screen.getByText('準備中').getAttribute('aria-disabled')).toBe('true')
    expect(screen.queryByRole('link', { name: '最初のトピック →' })).toBeNull()
  })

  it('distinguishes loading and retrieval failures from a preparation state', () => {
    const { rerender } = render(<DomainProgressFallback />)

    expect(screen.getByText('学習データを読み込んでいます…')).toBeTruthy()
    expect(screen.queryByText('準備中')).toBeNull()

    rerender(<DomainProgressError />)
    expect(screen.getByText(/学習データを読み込めませんでした/)).toBeTruthy()
    expect(screen.queryByText('準備中')).toBeNull()
  })
})
