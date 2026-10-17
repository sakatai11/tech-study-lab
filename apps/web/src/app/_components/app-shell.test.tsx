// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AnalyticsSummaryResponse } from '@tsl/shared'

const { fetchDashboardSummaryMock, recordLessonViewMock, submitAnswerMock } = vi.hoisted(() => ({
  fetchDashboardSummaryMock: vi.fn(),
  recordLessonViewMock: vi.fn(),
  submitAnswerMock: vi.fn(),
}))

vi.mock('@/features/dashboard/api/dashboard-api', () => ({
  fetchDashboardSummary: fetchDashboardSummaryMock,
}))

vi.mock('@/features/lesson/api/lesson-api', () => ({ recordLessonView: recordLessonViewMock }))
vi.mock('@/features/quiz/api/quiz-api', () => ({ submitAnswer: submitAnswerMock }))

vi.mock('@/features/dashboard/client/components/due-count-badge', () => ({
  DueCountBadge: () => <span>due</span>,
  DueCountProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/features/dashboard/server/load-dashboard', () => ({
  loadDashboardStatic: () => ({
    continueHref: '/learn/security/xss/preventing-xss',
    learnHref: '/learn/security/xss/preventing-xss',
    quizHref: '/quiz/preventing-xss',
  }),
}))

import { LessonViewRecorder } from '@/features/lesson/client/components/lesson-view-recorder'
import { QuizInteractive } from '@/features/quiz/client/components/quiz-interactive'
import { AppShell } from './app-shell'

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined
  let rejectPromise: ((reason: Error) => void) | undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return {
    promise,
    resolve: (value: T) => resolvePromise?.(value),
    reject: (reason: Error) => rejectPromise?.(reason),
  }
}

function Quiz() {
  return (
    <QuizInteractive
      explanations={{ 'question-1': '解説' }}
      questions={[{ id: 'question-1', choices: ['選択肢 1', '選択肢 2'], prompt: '問題文' }]}
      resultHomeHref="/learn"
      resultHomeLabel="教材一覧へ"
      title="XSS 演習"
    />
  )
}

const summary = {
  totalAnswerCount: 12,
  correctAnswerRate: 75,
  averageResponseTimeMs: 800,
  masteredQuestionCount: 2,
  currentStreakDays: 1,
  thisWeekStudyTimeMs: 120_000,
  retentionDistribution: { masteredCount: 2, learningCount: 1, dueCount: 1 },
} satisfies AnalyticsSummaryResponse

describe('AppShell', () => {
  beforeEach(() => {
    fetchDashboardSummaryMock.mockReset()
    fetchDashboardSummaryMock.mockImplementation(() => new Promise(() => {}))
    recordLessonViewMock.mockReset()
    submitAnswerMock.mockReset()
  })

  afterEach(cleanup)

  it.each([true, false])(
    'updates the mounted streak after a recorded answer (correct: %s)',
    async (isCorrect) => {
      fetchDashboardSummaryMock
        .mockResolvedValueOnce({ ...summary, currentStreakDays: 0 })
        .mockResolvedValueOnce(summary)
      submitAnswerMock.mockResolvedValue({ correctIndex: 0, isCorrect })
      render(
        <AppShell currentNavigation="quiz">
          <Quiz />
        </AppShell>,
      )
      await screen.findByText('0日')

      fireEvent.click(screen.getByRole('button', { name: '演習を開始' }))
      fireEvent.click(screen.getByRole('button', { name: '1番 選択肢 1' }))

      expect(await screen.findByText('1日')).toBeTruthy()
      expect(fetchDashboardSummaryMock).toHaveBeenCalledTimes(2)
      expect(screen.getByText('quiz / exercise')).toBeTruthy()
    },
  )

  it('does not invalidate the streak when recording an answer fails', async () => {
    fetchDashboardSummaryMock.mockResolvedValue({ ...summary, currentStreakDays: 0 })
    submitAnswerMock.mockRejectedValue(new Error('解答送信失敗'))
    render(
      <AppShell currentNavigation="quiz">
        <Quiz />
      </AppShell>,
    )
    await screen.findByText('0日')

    fireEvent.click(screen.getByRole('button', { name: '演習を開始' }))
    fireEvent.click(screen.getByRole('button', { name: '1番 選択肢 1' }))

    expect(await screen.findByText('解答送信失敗')).toBeTruthy()
    expect(fetchDashboardSummaryMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('0日')).toBeTruthy()
  })

  it('updates the streak after recording the current lesson view', async () => {
    const recording = createDeferred<unknown>()
    recordLessonViewMock.mockReturnValue(recording.promise)
    fetchDashboardSummaryMock
      .mockResolvedValueOnce({ ...summary, currentStreakDays: 0 })
      .mockResolvedValueOnce(summary)
    render(
      <AppShell currentNavigation="learn">
        <LessonViewRecorder lessonId="lesson-1" />
      </AppShell>,
    )
    await screen.findByText('0日')

    await act(async () => recording.resolve({}))

    expect(await screen.findByText('1日')).toBeTruthy()
    expect(fetchDashboardSummaryMock).toHaveBeenCalledTimes(2)
  })

  it('does not invalidate the streak when recording a lesson view fails', async () => {
    const recording = createDeferred<unknown>()
    recordLessonViewMock.mockReturnValue(recording.promise)
    fetchDashboardSummaryMock.mockResolvedValue({ ...summary, currentStreakDays: 0 })
    render(
      <AppShell currentNavigation="learn">
        <LessonViewRecorder lessonId="lesson-1" />
      </AppShell>,
    )
    await screen.findByText('0日')

    await act(async () => recording.reject(new Error('閲覧記録失敗')))

    expect(fetchDashboardSummaryMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('0日')).toBeTruthy()
  })

  it.each(['success', 'failure'])(
    'ignores an older summary %s after activity updates the streak',
    async (outcome) => {
      const initialSummary = createDeferred<AnalyticsSummaryResponse>()
      const recording = createDeferred<unknown>()
      recordLessonViewMock.mockReturnValue(recording.promise)
      fetchDashboardSummaryMock
        .mockReturnValueOnce(initialSummary.promise)
        .mockResolvedValueOnce(summary)
      render(
        <AppShell currentNavigation="learn">
          <LessonViewRecorder lessonId="lesson-1" />
        </AppShell>,
      )

      await act(async () => recording.resolve({}))
      expect(await screen.findByText('1日')).toBeTruthy()
      await act(async () => {
        if (outcome === 'success') initialSummary.resolve({ ...summary, currentStreakDays: 0 })
        else initialSummary.reject(new Error('old request failed'))
      })

      expect(screen.getByText('1日')).toBeTruthy()
      expect(screen.queryByText('0日')).toBeNull()
    },
  )

  it('hides the previous streak if reloading after activity fails', async () => {
    const recording = createDeferred<unknown>()
    recordLessonViewMock.mockReturnValue(recording.promise)
    fetchDashboardSummaryMock
      .mockResolvedValueOnce({ ...summary, currentStreakDays: 0 })
      .mockRejectedValueOnce(new Error('summary unavailable'))
    render(
      <AppShell currentNavigation="learn">
        <LessonViewRecorder lessonId="lesson-1" />
      </AppShell>,
    )
    await screen.findByText('0日')

    await act(async () => recording.resolve({}))

    expect(fetchDashboardSummaryMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('連続学習')).toBeNull()
    expect(screen.queryByText('0日')).toBeNull()
  })

  it('stops listening for activity after the shell unmounts', async () => {
    fetchDashboardSummaryMock.mockResolvedValue(summary)
    const { unmount } = render(<AppShell currentNavigation="learn">教材</AppShell>)
    await screen.findByText('1日')
    unmount()
    recordLessonViewMock.mockResolvedValue({})

    await act(async () => {
      render(<LessonViewRecorder lessonId="lesson-1" />)
    })

    expect(fetchDashboardSummaryMock).toHaveBeenCalledTimes(1)
  })

  it('hides the streak while loading instead of showing a fixed number', () => {
    render(<AppShell currentNavigation="dashboard">home</AppShell>)

    expect(screen.queryByText('12日')).toBeNull()
    expect(screen.queryByText('連続学習')).toBeNull()
  })

  it.each([1, 0])('shows the API current streak of %i days', async (currentStreakDays) => {
    fetchDashboardSummaryMock.mockResolvedValue({ ...summary, currentStreakDays })

    render(<AppShell currentNavigation="dashboard">home</AppShell>)

    expect(await screen.findByText(`${currentStreakDays}日`)).toBeTruthy()
    expect(screen.getByText('連続学習')).toBeTruthy()
    expect(fetchDashboardSummaryMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('12日')).toBeNull()
  })

  it('keeps the streak hidden when the API fails and still renders navigation', async () => {
    fetchDashboardSummaryMock.mockRejectedValue(new Error('API unavailable'))

    await act(async () => {
      render(<AppShell currentNavigation="dashboard">home</AppShell>)
    })

    expect(fetchDashboardSummaryMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('連続学習')).toBeNull()
    expect(screen.queryByText('12日')).toBeNull()
    expect(screen.getByRole('navigation', { name: 'モバイルナビゲーション' })).toBeTruthy()
  })

  it('[ADR-0013] leaves user streak data out of server-rendered content pages', () => {
    const html = renderToString(<AppShell currentNavigation="learn">教材一覧</AppShell>)

    expect(fetchDashboardSummaryMock).not.toHaveBeenCalled()
    expect(html).not.toContain('連続学習')
    expect(html).not.toContain('12日')
    expect(html).toContain('教材一覧')
  })

  it('removes sidebar sample progress while preserving all six navigation links', () => {
    render(<AppShell currentNavigation="dashboard">home</AppShell>)

    const desktop = screen.getByRole('navigation', { name: 'メインナビゲーション' })
    expect(desktop.querySelectorAll('a')).toHaveLength(6)
    expect(screen.queryByText('学習データ')).toBeNull()
    expect(screen.queryByText('sample')).toBeNull()
    expect(screen.queryByText('foundation: 35%')).toBeNull()
    expect(screen.queryByRole('progressbar', { name: '基盤実装の進捗' })).toBeNull()
  })

  it('uses /home for the selected desktop dashboard and mobile home navigation', () => {
    render(
      <AppShell currentNavigation="dashboard">
        <p>dashboard content</p>
      </AppShell>,
    )

    const desktop = screen.getByRole('navigation', { name: 'メインナビゲーション' })
    const desktopDashboard = desktop.querySelector('a[href="/home"]')
    expect(desktopDashboard).toHaveProperty('textContent', expect.stringContaining('ホーム'))
    expect(desktopDashboard?.getAttribute('aria-current')).toBe('page')

    const mobile = screen.getByRole('navigation', { name: 'モバイルナビゲーション' })
    const mobileHome = mobile.querySelector('a[href="/home"]')
    expect(mobileHome).toHaveProperty('textContent', expect.stringContaining('ホーム'))
    expect(mobileHome?.getAttribute('aria-current')).toBe('page')
    expect(desktop.querySelector('a[href="/learn"]')).toHaveProperty(
      'textContent',
      expect.stringContaining('教材'),
    )
    expect(desktop.querySelector('a[href="/review"]')).toHaveProperty(
      'textContent',
      expect.stringContaining('復習'),
    )
    expect(desktop.querySelector('a[href="/analytics"]')).toHaveProperty(
      'textContent',
      expect.stringContaining('学習分析'),
    )
  })

  it('links both lesson navigation items to /learn and selects them for the learn section', () => {
    render(
      <AppShell currentNavigation="learn">
        <p>教材一覧</p>
      </AppShell>,
    )

    for (const label of ['メインナビゲーション', 'モバイルナビゲーション']) {
      const link = screen.getByRole('navigation', { name: label }).querySelector('a[href="/learn"]')
      expect(link?.textContent).toContain('教材')
      expect(link?.getAttribute('aria-current')).toBe('page')
    }
  })
})
