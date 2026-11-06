// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const loadDashboardStatic = vi.hoisted(() => vi.fn())
const loadLessonTitles = vi.hoisted(() => vi.fn(() => ({ 'lesson-1': 'XSS lesson' })))

vi.mock('@/features/dashboard/client/components/dashboard-user-sections', () => ({
  DashboardUserSections: ({ lessonTitles }: { lessonTitles: Record<string, string> }) => (
    <p>{`user-sections:${Object.values(lessonTitles).join(',')}`}</p>
  ),
}))

vi.mock('@/features/dashboard/server/load-dashboard', () => ({
  loadDashboardStatic,
  loadLessonTitles,
}))

import { DashboardPageContent } from './dashboard-page-content'

describe('DashboardPageContent', () => {
  afterEach(() => {
    cleanup()
    loadDashboardStatic.mockReset()
  })

  it('keeps the dashboard content, due card, and learning links', () => {
    loadDashboardStatic.mockReturnValue({
      continueHref: '/learn/security/xss/preventing-xss',
      learnHref: '/learn/security/xss/preventing-xss',
      quizHref: '/quiz/preventing-xss',
    })

    render(<DashboardPageContent />)

    expect(screen.getByRole('heading', { name: '今日の学習' })).toBeTruthy()
    // ユーザー固有の区画には、content 由来のレッスン名だけを渡す（ADR-0019）。
    expect(screen.getByText('user-sections:XSS lesson')).toBeTruthy()
    expect(screen.queryByText('表示用サンプル')).toBeNull()
    // 復習への導線は due 件数を知るユーザー固有の区画だけが持つ。
    expect(screen.queryByRole('link', { name: '復習を始める' })).toBeNull()
    expect(screen.getByRole('link', { name: '教材を読む' })).toHaveProperty(
      'href',
      'http://localhost:3000/learn/security/xss/preventing-xss',
    )
  })

  it('does not show a next-lesson card when no bundled lesson is available', () => {
    loadDashboardStatic.mockReturnValue({
      continueHref: '/home',
      learnHref: undefined,
      quizHref: undefined,
    })

    render(<DashboardPageContent />)

    expect(screen.queryByText('LESSON')).toBeNull()
    expect(screen.queryByRole('link', { name: '教材を読む' })).toBeNull()
  })
})
