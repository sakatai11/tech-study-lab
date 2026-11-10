import type { Root } from 'hast'
import { describe, expect, it } from 'vitest'

import type { BundledLesson, BundledTopic } from '@tsl/shared'

import { lessonContentToViewModel, lessonTocFromBody, topicContentToViewModel } from './mapper'

const tree: Root = { type: 'root', children: [] }

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
  estimatedMinutes: 18,
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
    expect(topicContentToViewModel(topic, [lesson], 'security', tree)).toEqual({
      domain: 'security',
      topic: 'xss',
      title: 'XSS',
      overview: tree,
      lessons: [{ id: 'security-xss-01', title: '安全な表示', questionCount: 1 }],
    })
  })

  it('maps lesson content without answer keys or explanations', () => {
    const viewModel = lessonContentToViewModel(lesson, tree)

    expect(viewModel).toEqual({
      domain: 'security',
      topic: 'xss',
      id: 'security-xss-01',
      title: '安全な表示',
      estimatedMinutes: 18,
      body: tree,
      toc: [],
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

  it('builds the table of contents from top-level h2 headings in order', () => {
    const body: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'h1',
          properties: {},
          children: [{ type: 'text', value: '題' }],
        },
        {
          type: 'element',
          tagName: 'h2',
          properties: { id: 'section-1' },
          children: [
            { type: 'text', value: 'ログイン時に ' },
            {
              type: 'element',
              tagName: 'code',
              properties: {},
              children: [{ type: 'text', value: 'sid' }],
            },
            { type: 'text', value: ' を再生成する ' },
          ],
        },
        { type: 'text', value: '\n' },
        {
          type: 'element',
          tagName: 'div',
          properties: { dataCallout: 'note' },
          children: [
            {
              type: 'element',
              tagName: 'h2',
              properties: { id: 'nested' },
              children: [{ type: 'text', value: '入れ子' }],
            },
          ],
        },
        {
          type: 'element',
          tagName: 'h2',
          properties: { id: 'section-2' },
          children: [{ type: 'text', value: 'まとめ' }],
        },
      ],
    }

    expect(lessonTocFromBody(body)).toEqual([
      { id: 'section-1', title: 'ログイン時に sid を再生成する' },
      { id: 'section-2', title: 'まとめ' },
    ])
  })

  it('skips h2 headings without an id or text', () => {
    const body: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'h2',
          properties: {},
          children: [{ type: 'text', value: 'A' }],
        },
        { type: 'element', tagName: 'h2', properties: { id: 'section-2' }, children: [] },
      ],
    }

    expect(lessonTocFromBody(body)).toEqual([])
  })
})
