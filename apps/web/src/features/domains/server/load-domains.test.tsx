// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createClient } from '@tsl/api/client'

const createServerApiClient = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-server', () => ({ createServerApiClient }))

import { DomainsPageContent } from './components/domains-page-content'

const domains = ['security', 'frontend', 'backend', 'architecture'] as const

describe('domains page loader and content', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('still requests domain progress and shows accessible cards and bundled topic links', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        domains: domains.map((domain) => ({
          domain,
          masteredQuestionCount: 1,
          totalQuestionCount: 2,
          masteryRate: 50,
          topicCount: 1,
          lessonCount: 1,
        })),
      }),
    )
    createServerApiClient.mockResolvedValue(createClient('https://api.example.test', { fetch }))

    render(await DomainsPageContent())

    expect(fetch).toHaveBeenCalledOnce()
    expect(new URL(String(fetch.mock.calls[0]?.[0])).pathname).toBe('/domains')
    expect(screen.getByRole('heading', { name: '学習領域' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '領域別の習得状況' })).toBeTruthy()
    for (const label of ['セキュリティ', 'フロントエンド', 'バックエンド', 'アーキテクチャ']) {
      expect(screen.getByRole('heading', { name: label })).toBeTruthy()
    }
    const links = screen.getAllByRole('link', { name: '最初のトピック' })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link.getAttribute('href')).toMatch(/^\/learn\//)
    expect(screen.getAllByRole('progressbar')).toHaveLength(4)
  })
})
