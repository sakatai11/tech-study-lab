import { describe, expect, it } from 'vitest'

import type { BundledLesson } from '@tsl/shared'

import { quizContentToViewModel } from './mapper'

const lesson: BundledLesson = {
  domain: 'security',
  topic: 'xss',
  lessonId: 'security-xss-01',
  title: '安全な表示',
  relativePath: 'security/xss/security-xss-01.md',
  body: '# 本文',
  questions: [
    {
      id: 'security-xss-01-q1',
      type: 'mcq',
      prompt: 'どれ？',
      choices: ['A', 'B', 'C', 'D'],
      answerIndex: 1,
      explanation: '理由',
    },
  ],
}

describe('quizContentToViewModel', () => {
  it('keeps the answer key out of the client view model', () => {
    const viewModel = quizContentToViewModel(lesson, 'security-xss-02')

    expect(viewModel).toEqual({
      domain: 'security',
      topic: 'xss',
      lessonId: 'security-xss-01',
      title: '安全な表示',
      questions: [
        {
          id: 'security-xss-01-q1',
          prompt: 'どれ？',
          choices: ['A', 'B', 'C', 'D'],
        },
      ],
      explanations: { 'security-xss-01-q1': '理由' },
      nextLessonId: 'security-xss-02',
    })
    expect(viewModel.questions[0]).not.toHaveProperty('answerIndex')
  })
})
