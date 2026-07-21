import type { McqQuestion, ReviewQueueResponse } from '@tsl/shared'

import { contentQuestionToQuizQuestion } from '../shared/quiz-question'
import type { ReviewViewModel } from './view-model'

const DAY_MS = 24 * 60 * 60 * 1000

export function reviewQueueToViewModel(
  queue: ReviewQueueResponse,
  questions: ReadonlyMap<string, McqQuestion>,
  now: number,
): ReviewViewModel {
  const joinedItems = queue.items.flatMap((item) => {
    const question = questions.get(item.questionId)

    if (!question) {
      return []
    }

    return [
      {
        dueAt: item.dueAt,
        overdueDays: Math.max(0, Math.floor((now - item.dueAt) / DAY_MS)),
        question,
      },
    ]
  })

  return {
    domain: '',
    topic: '',
    lessonId: 'review',
    title: '今日の復習',
    questions: joinedItems.map((item) => contentQuestionToQuizQuestion(item.question)),
    explanations: Object.fromEntries(
      joinedItems.map((item) => [item.question.id, item.question.explanation]),
    ),
    resultHomeHref: '/',
    resultHomeLabel: 'ホームへ',
    hasNextBatch: queue.items.length === 20,
    batchKey: joinedItems.map((item) => `${item.question.id}:${item.dueAt}`).join('|'),
    dueCount: joinedItems.length,
    previews: joinedItems.map((item) => ({
      overdueDays: item.overdueDays,
      questionId: item.question.id,
    })),
  }
}
