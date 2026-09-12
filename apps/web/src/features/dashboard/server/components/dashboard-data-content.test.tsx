// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
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
  domains: (
    [
      ['security', 'セキュリティ'],
      ['frontend', 'フロントエンド'],
      ['backend', 'バックエンド'],
      ['architecture', 'アーキテクチャ'],
    ] as const
  ).map(([domain, label]) => ({
    domain,
    label,
    masteredQuestionCount: 1,
    totalQuestionCount: 2,
    masteryRate: 50,
    topicCount: 1,
    lessonCount: 1,
    firstTopicHref: `/learn/${domain}/topic`,
  })),
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

  it('shows live summary, heatmap, domains, activity, and no sample labels', () => {
    render(<DashboardDataContent viewModel={viewModel} />)

    expect(screen.getByText('75')).toBeTruthy()
    expect(screen.getByText('正答率')).toBeTruthy()
    expect(
      screen.getByRole('list', { name: '直近26週・182日間の学習コントリビューション' }),
    ).toBeTruthy()
    expect(screen.getByText('2026-09-01: 4問')).toBeTruthy()
    const analyticsLink = screen.getByRole('link', { name: 'すべて表示' })
    expect(analyticsLink).toHaveProperty('href', 'http://localhost:3000/analytics')
    expect(analyticsLink.className).toContain('lg:hidden')
    expect(screen.getByRole('heading', { name: '領域別の習得状況' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '最近のアクティビティ' })).toBeTruthy()
    expect(screen.getByText('問題に回答して復習予定を更新しました（安全な画面表示）')).toBeTruthy()
    expect(screen.queryByText('表示用サンプル')).toBeNull()
    expect(screen.queryByText('実際の解答ログはまだ接続していません')).toBeNull()
  })

  it('shows an empty activity message when there are no saved facts', () => {
    render(<DashboardDataContent viewModel={{ ...viewModel, activity: [] }} />)
    expect(screen.getByText('まだ学習アクティビティがありません。')).toBeTruthy()
  })
})
