// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createClient } from '@tsl/api/client'

import { clearClientQueryCache } from '@/lib/use-client-query'

const createBrowserApiClient = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  createBrowserApiClient,
}))

import type { DomainTopicRoute } from '../../view-model'
import { DomainProgressSection } from './domain-progress-section'

const domains = ['security', 'frontend', 'backend', 'architecture'] as const
const topicRoutes: DomainTopicRoute[] = [
  { domain: 'security', topic: 'xss', order: 1 },
  { domain: 'frontend', topic: 'rendering', order: 1 },
]

function domainsResponse() {
  return Response.json({
    domains: domains.map((domain) => ({
      domain,
      masteredQuestionCount: 1,
      totalQuestionCount: 2,
      masteryRate: 50,
      topicCount: 1,
      lessonCount: 1,
    })),
  })
}

describe('DomainProgressSection [ADR-0019]', () => {
  afterEach(() => {
    cleanup()
    clearClientQueryCache()
    vi.resetAllMocks()
  })

  it('requests domain progress in the browser and shows accessible cards and topic links', async () => {
    const fetch = vi.fn().mockResolvedValue(domainsResponse())
    createBrowserApiClient.mockReturnValue(createClient('https://api.example.test', { fetch }))

    render(<DomainProgressSection topicRoutes={topicRoutes} />)

    expect(screen.getByRole('status').textContent).toContain('領域別の習得状況を読み込んでいます')
    expect(await screen.findByRole('heading', { name: 'セキュリティ' })).toBeTruthy()
    expect(fetch).toHaveBeenCalledOnce()
    expect(new URL(String(fetch.mock.calls[0]?.[0])).pathname).toBe('/domains')
    expect(screen.getByRole('region', { name: '領域別の習得状況' })).toBeTruthy()
    for (const label of ['セキュリティ', 'フロントエンド', 'バックエンド', 'アーキテクチャ']) {
      expect(screen.getByRole('heading', { name: label })).toBeTruthy()
      expect(screen.getByRole('progressbar', { name: `${label} の習得状況` })).toBeTruthy()
    }
    expect(
      screen
        .getAllByRole('link', { name: '最初のトピック' })
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/learn/security/xss', '/learn/frontend/rendering'])
  })

  it('shows an error with a retry when the request fails', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(domainsResponse())
    createBrowserApiClient.mockReturnValue(createClient('https://api.example.test', { fetch }))

    render(<DomainProgressSection topicRoutes={topicRoutes} />)

    expect(await screen.findByText('学習領域を読み込めませんでした')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(await screen.findByRole('heading', { name: 'セキュリティ' })).toBeTruthy()
  })
})
