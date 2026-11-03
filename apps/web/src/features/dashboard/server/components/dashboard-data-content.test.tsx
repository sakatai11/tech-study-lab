// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { DashboardViewModel } from '../../view-model'

import { DashboardDataContent } from './dashboard-data-content'

const viewModel: DashboardViewModel = {
  summary: {
    totalAnswerCount: 4,
    correctAnswerRate: 75,
    averageResponseTimeMs: 900,
    masteredQuestionCount: 2,
    currentStreakDays: 3,
    thisWeekStudyTimeMs: 120_000,
    retentionDistribution: { masteredCount: 1, learningCount: 2, dueCount: 1 },
  },
  heatmap: {
    days: Array.from({ length: 182 }, (_, index) => ({
      date: new Date(Date.parse('2026-03-04T00:00:00Z') + index * 86_400_000)
        .toISOString()
        .slice(0, 10),
      answerCount: index === 181 ? 4 : 0,
    })),
  },
  activity: [
    {
      id: 'answer:1',
      type: 'answer_recorded',
      occurredAt: Date.parse('2026-08-31T00:00:00Z'),
      questionId: 'question-1',
      lessonId: 'lesson-1',
      lessonTitle: '安全な画面表示',
      isCorrect: true,
    },
  ],
}

describe('DashboardDataContent', () => {
  afterEach(cleanup)

  it('shows live summary, heatmap, activity, and no sample labels', () => {
    render(<DashboardDataContent viewModel={viewModel} />)

    expect(screen.getByText('75')).toBeTruthy()
    expect(screen.getByText('正答率')).toBeTruthy()
    expect(
      screen.getByText(
        '直近182日間で1日学習し、合計4問に解答しました。最も多かったのは9/1の4問です。',
      ),
    ).toBeTruthy()
    const analyticsLink = screen.getByRole('link', { name: '学習分析を見る' })
    expect(analyticsLink).toHaveProperty('href', 'http://localhost:3000/analytics')
    expect(analyticsLink.className).toContain('lg:hidden')
    expect(screen.queryByRole('heading', { name: '領域別の習得状況' })).toBeNull()
    expect(screen.queryByText('復習間隔が21日以上になった問題を習得済みとして数えます')).toBeNull()
    expect(screen.queryByRole('link', { name: /最初のトピック/ })).toBeNull()
    const summary = screen.getByRole('region', { name: '学習サマリー' })
    expect(within(summary).getByText('習得済み問題')).toBeTruthy()
    expect(within(summary).getByText('2')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '最近のアクティビティ' })).toBeTruthy()
    expect(
      screen.getByText('問題に解答し、復習の予定を更新しました（安全な画面表示）'),
    ).toBeTruthy()
    expect(screen.queryByText('表示用サンプル')).toBeNull()
    expect(screen.queryByText('実際の解答ログはまだ接続していません')).toBeNull()
  })

  it('draws all 182 days as squares grouped into one path per heatmap level', () => {
    const { container } = render(
      <DashboardDataContent
        viewModel={{
          ...viewModel,
          heatmap: {
            days: viewModel.heatmap.days.map((day, index) => ({
              ...day,
              answerCount: [0, 1, 2, 4, 8][index % 5] ?? 0,
            })),
          },
        }}
      />,
    )

    const paths = container.querySelectorAll('svg path')
    expect(paths).toHaveLength(5)
    const squares = [...paths].map((path) => path.getAttribute('d')?.match(/M/g)?.length ?? 0)
    expect(squares.reduce((sum, count) => sum + count, 0)).toBe(182)
    expect(
      screen.getByText(
        '直近182日間で145日学習し、合計541問に解答しました。最も多かったのは3/8の8問です。',
      ),
    ).toBeTruthy()
  })

  it('omits empty levels and summarizes a period without answers', () => {
    const { container } = render(
      <DashboardDataContent
        viewModel={{
          ...viewModel,
          heatmap: { days: viewModel.heatmap.days.map((day) => ({ ...day, answerCount: 0 })) },
        }}
      />,
    )

    expect(container.querySelectorAll('svg path')).toHaveLength(1)
    expect(screen.getByText('直近182日間の学習記録はまだありません。')).toBeTruthy()
  })

  it('shows an empty activity message when there are no saved facts', () => {
    render(<DashboardDataContent viewModel={{ ...viewModel, activity: [] }} />)
    expect(screen.getByText('まだ学習アクティビティがありません。')).toBeTruthy()
  })
})
