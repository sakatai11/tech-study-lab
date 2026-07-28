import { describe, expect, it } from 'vitest'

import {
  getBundledQuestions,
  getLessonContent,
  getLessonRouteParams,
  getLessonsByTopic,
  getQuestionById,
  getQuizRouteParams,
  getTopicContent,
  getTopicRouteParams,
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

  it('returns the topic index by domain and topic', () => {
    const topic = getTopicContent('security', 'xss')

    expect(topic?.title).toBe('XSS（クロスサイトスクリプティング）')
    expect(topic?.body).toContain('XSS が起こる条件')
  })

  it('does not resolve content from another domain', () => {
    expect(getTopicContent('frontend', 'xss')).toBeUndefined()
  })
})

describe('route params for generateStaticParams', () => {
  it('enumerates every bundled lesson for /learn/[domain]/[topic]/[lesson]', () => {
    expect(getLessonRouteParams()).toContainEqual({
      domain: 'security',
      topic: 'xss',
      lesson: 'security-xss-01',
    })
  })

  it('deduplicates topics that share several lessons', () => {
    const params = getTopicRouteParams()
    const keys = params.map(({ domain, topic }) => `${domain}/${topic}`)

    expect(keys).toContain('security/xss')
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('enumerates every bundled lesson for /quiz/[lesson]', () => {
    expect(getQuizRouteParams()).toContainEqual({ lesson: 'security-xss-01' })
  })

  it('keeps lesson and quiz params in sync', () => {
    expect(getQuizRouteParams().map(({ lesson }) => lesson)).toEqual(
      getLessonRouteParams().map(({ lesson }) => lesson),
    )
  })
})
