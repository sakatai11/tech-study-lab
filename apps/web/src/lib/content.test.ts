import { describe, expect, it } from 'vitest'

import {
  getBundledQuestions,
  getLessonContent,
  getLessonsByTopic,
  getQuestionById,
} from './content'

describe('content query API', () => {
  it('returns the Markdown lesson content by lessonId', () => {
    const lesson = getLessonContent('security-xss-01')

    expect(lesson?.body).toContain('# XSSを防ぐ安全な画面表示')
    expect(lesson?.questions).toHaveLength(3)
  })

  it('returns lessons for one domain and topic in lesson ID order', () => {
    expect(getLessonsByTopic('security', 'xss').map((lesson) => lesson.lessonId)).toEqual([
      'security-xss-01',
    ])
  })

  it('offers a questionId index and resolves an individual question', () => {
    const questions = getBundledQuestions()

    expect(questions.get('security-xss-01-q1')?.answerIndex).toBe(0)
    expect(getQuestionById('security-xss-01-q3')?.id).toBe('security-xss-01-q3')
  })

  it('returns undefined for unknown IDs', () => {
    expect(getLessonContent('missing-lesson')).toBeUndefined()
    expect(getQuestionById('missing-question')).toBeUndefined()
  })
})
