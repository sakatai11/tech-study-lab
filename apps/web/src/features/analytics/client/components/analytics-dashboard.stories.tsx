import type { Meta, StoryObj } from '@storybook/react-vite'

import type { AnalyticsViewModel } from '../../view-model'

import { AnalyticsDashboard } from './analytics-dashboard'

const viewModel: AnalyticsViewModel = {
  summary: {
    totalAnswerCount: 48,
    correctAnswerRate: 75,
    averageResponseTimeMs: 8_400,
    masteredQuestionCount: 12,
    currentStreakDays: 3,
    thisWeekStudyTimeMs: 1_560_000,
    retentionDistribution: { masteredCount: 12, learningCount: 9, dueCount: 4 },
  },
  weekly: [
    { date: '2026-08-31', weekday: 1, weekdayLabel: '月', answerCount: 8 },
    { date: '2026-09-01', weekday: 2, weekdayLabel: '火', answerCount: 0 },
    { date: '2026-09-02', weekday: 3, weekdayLabel: '水', answerCount: 12 },
    { date: '2026-09-03', weekday: 4, weekdayLabel: '木', answerCount: 5 },
    { date: '2026-09-04', weekday: 5, weekdayLabel: '金', answerCount: 9 },
    { date: '2026-09-05', weekday: 6, weekdayLabel: '土', answerCount: 14 },
    { date: '2026-09-06', weekday: 7, weekdayLabel: '日', answerCount: 0 },
  ],
  mistakes: [
    {
      questionId: 'security-xss-01-q2',
      incorrectRate: 67,
      answerCount: 3,
      incorrectAnswerCount: 2,
    },
    {
      questionId: 'security-csrf-01-q1',
      incorrectRate: 50,
      answerCount: 4,
      incorrectAnswerCount: 2,
    },
  ],
}

const meta = {
  title: 'Features/Analytics/AnalyticsDashboard',
  component: AnalyticsDashboard,
  args: { viewModel },
} satisfies Meta<typeof AnalyticsDashboard>

export default meta
type Story = StoryObj<typeof meta>

export const WithData: Story = {}

/** 間違えやすい問題を出せるだけの解答がまだない状態。 */
export const NoMistakes: Story = { args: { viewModel: { ...viewModel, mistakes: [] } } }

export const NoActivity: Story = {
  args: {
    viewModel: {
      summary: {
        totalAnswerCount: 0,
        correctAnswerRate: 0,
        averageResponseTimeMs: 0,
        masteredQuestionCount: 0,
        currentStreakDays: 0,
        thisWeekStudyTimeMs: 0,
        retentionDistribution: { masteredCount: 0, learningCount: 0, dueCount: 0 },
      },
      weekly: viewModel.weekly.map((day) => ({ ...day, answerCount: 0 })),
      mistakes: [],
    },
  },
}
