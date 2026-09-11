import { describe, expect, it } from 'vitest'

import { dashboardToViewModel, dueCountToViewModel } from './mapper'

describe('dueCountToViewModel', () => {
  it('normalizes the shared API DTO into the dashboard due-card contract', () => {
    expect(dueCountToViewModel({ dueCount: 4 })).toEqual({ dueCount: 4 })
  })

  it('preserves zero so the due-card can distinguish an empty queue', () => {
    expect(dueCountToViewModel({ dueCount: 0 })).toEqual({ dueCount: 0 })
  })
})

describe('dashboardToViewModel', () => {
  it('resolves known lesson titles and falls back to IDs for missing content', () => {
    const summary = {
      totalAnswerCount: 1,
      correctAnswerRate: 100,
      averageResponseTimeMs: 500,
      masteredQuestionCount: 1,
      currentStreakDays: 1,
      thisWeekStudyTimeMs: 1_000,
      retentionDistribution: { masteredCount: 1, learningCount: 0, dueCount: 0 },
    }
    const heatmap = {
      days: Array.from({ length: 182 }, (_, index) => ({
        date: new Date(Date.parse('2026-03-04T00:00:00Z') + index * 86_400_000)
          .toISOString()
          .slice(0, 10),
        answerCount: 0,
      })),
    }
    const domains = [
      {
        domain: 'security' as const,
        label: 'セキュリティ',
        masteredQuestionCount: 1,
        totalQuestionCount: 1,
        masteryRate: 100,
        topicCount: 1,
        lessonCount: 1,
        firstTopicHref: '/learn/security/xss',
      },
    ]

    expect(
      dashboardToViewModel(
        summary,
        heatmap,
        domains,
        {
          items: [
            {
              id: 'view-1',
              type: 'lesson_viewed',
              occurredAt: 1,
              lessonId: 'known-lesson',
            },
            {
              id: 'answer-1',
              type: 'answer_recorded',
              occurredAt: 0,
              questionId: 'unknown-question',
              lessonId: 'missing-lesson',
              isCorrect: false,
            },
            {
              id: 'answer-2',
              type: 'answer_recorded',
              occurredAt: 0,
              questionId: 'orphan-question',
              lessonId: null,
              isCorrect: true,
            },
          ],
        },
        new Map([['known-lesson', '既知の教材']]),
      ),
    ).toMatchObject({
      summary,
      heatmap,
      domains,
      activity: [
        { id: 'view-1', lessonTitle: '既知の教材' },
        { id: 'answer-1', lessonTitle: 'missing-lesson' },
        { id: 'answer-2', lessonTitle: null },
      ],
    })
  })

  it('keeps an empty activity list empty', () => {
    const heatmap = {
      days: Array.from({ length: 182 }, (_, index) => ({
        date: new Date(Date.parse('2026-03-04T00:00:00Z') + index * 86_400_000)
          .toISOString()
          .slice(0, 10),
        answerCount: 0,
      })),
    }
    expect(
      dashboardToViewModel(
        {
          totalAnswerCount: 0,
          correctAnswerRate: 0,
          averageResponseTimeMs: 0,
          masteredQuestionCount: 0,
          currentStreakDays: 0,
          thisWeekStudyTimeMs: 0,
          retentionDistribution: { masteredCount: 0, learningCount: 0, dueCount: 0 },
        },
        heatmap,
        [],
        { items: [] },
        new Map(),
      ).activity,
    ).toEqual([])
  })
})
