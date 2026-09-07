// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { AnalyticsViewModel } from '../../view-model'

import { AnalyticsDashboard } from './analytics-dashboard'

const viewModel: AnalyticsViewModel = {
  summary: {
    totalAnswerCount: 4,
    correctAnswerRate: 75,
    averageResponseTimeMs: 1_200,
    masteredQuestionCount: 2,
    currentStreakDays: 3,
    thisWeekStudyTimeMs: 120_000,
    retentionDistribution: { masteredCount: 1, learningCount: 2, dueCount: 1 },
  },
  weekly: [
    { date: '2026-08-30', weekday: 7, weekdayLabel: '日', answerCount: 1 },
    { date: '2026-08-31', weekday: 1, weekdayLabel: '月', answerCount: 3 },
  ],
  mistakes: [
    {
      questionId: 'security-xss-01-q1',
      incorrectRate: 50,
      answerCount: 2,
      incorrectAnswerCount: 1,
    },
  ],
}

describe('AnalyticsDashboard', () => {
  afterEach(cleanup)

  it('shows summary, weekly activity, retention distribution, and mistakes', () => {
    render(<AnalyticsDashboard viewModel={viewModel} />)

    expect(screen.getByText('週間アクティビティ')).toBeTruthy()
    expect(screen.getByText('SRS定着度分布')).toBeTruthy()
    expect(screen.getByText('間違えやすい問題')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByText('75')).toBeTruthy()
    expect(screen.getByText('1.2秒')).toBeTruthy()
    expect(screen.getByText('security-xss-01-q1')).toBeTruthy()
    expect(screen.queryByText('忘却曲線')).toBeNull()
    expect(screen.queryByText('復習タイミング')).toBeNull()
  })

  it('shows an empty-state message when no mistake has enough answers', () => {
    render(<AnalyticsDashboard viewModel={{ ...viewModel, mistakes: [] }} />)
    expect(screen.getByText('まだ十分な解答データがありません。')).toBeTruthy()
  })
})
