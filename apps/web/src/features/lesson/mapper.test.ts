import { describe, expect, it } from 'vitest'

import type { BundledLesson, BundledTopic } from '@tsl/shared'

import { lessonContentToViewModel, topicContentToViewModel } from './view-model'

const topic: BundledTopic = {
  topic: 'xss',
  title: 'XSS',
  order: 0,
  relativePath: 'security/xss/index.md',
  body: '概要',
}

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

describe('lesson view model mappers', () => {
  it('maps topic overview and ordered lesson summaries', () => {
    expect(topicContentToViewModel(topic, [lesson], 'security')).toEqual({
      domain: 'security',
      topic: 'xss',
      title: 'XSS',
      overviewMarkdown: '概要',
      lessons: [{ id: 'security-xss-01', title: '安全な表示', questionCount: 1 }],
    })
  })

  it('maps lesson content without answer keys or explanations', () => {
    const viewModel = lessonContentToViewModel(lesson)

    expect(viewModel).toEqual({
      domain: 'security',
      topic: 'xss',
      id: 'security-xss-01',
      title: '安全な表示',
      markdownBody: '# 本文',
      questions: [
        {
          id: 'security-xss-01-q1',
          prompt: 'どれ？',
          choices: ['A', 'B', 'C', 'D'],
        },
      ],
    })
    expect(viewModel.questions[0]).not.toHaveProperty('answerIndex')
    expect(viewModel.questions[0]).not.toHaveProperty('explanation')
  })
})
