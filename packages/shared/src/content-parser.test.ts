import { describe, expect, it } from 'vitest'

import { type ParsedContentSourceFile, createContentBundle } from './content-parser'

function topicFile(topic = 'xss'): ParsedContentSourceFile {
  return {
    relativePath: 'security/xss/index.md',
    frontmatter: { topic, title: 'XSS', order: 0 },
    body: 'Topic overview',
  }
}

function lessonFile({
  domain = 'security',
  topic = 'xss',
  lessonId = 'security-xss-01',
  questionId = 'security-xss-01-q1',
  questionIds = [questionId],
}: {
  domain?: string
  topic?: string
  lessonId?: string
  questionId?: string
  questionIds?: string[]
} = {}): ParsedContentSourceFile {
  return {
    relativePath: 'security/xss/security-xss-01.md',
    frontmatter: {
      domain,
      topic,
      lessonId,
      title: 'XSS basics',
      questions: questionIds.map((id) => ({
        id,
        type: 'mcq',
        prompt: 'Question',
        choices: ['A', 'B'],
        answerIndex: 0,
        explanation: 'Explanation',
      })),
    },
    body: '# Lesson body',
  }
}

describe('createContentBundle', () => {
  it('returns typed topic, lesson, and question data while preserving Markdown bodies', () => {
    expect(createContentBundle([lessonFile(), topicFile()])).toEqual({
      topics: [
        {
          relativePath: 'security/xss/index.md',
          topic: 'xss',
          title: 'XSS',
          order: 0,
          body: 'Topic overview',
        },
      ],
      lessons: [
        {
          relativePath: 'security/xss/security-xss-01.md',
          domain: 'security',
          topic: 'xss',
          lessonId: 'security-xss-01',
          title: 'XSS basics',
          questions: [
            {
              id: 'security-xss-01-q1',
              type: 'mcq',
              prompt: 'Question',
              choices: ['A', 'B'],
              answerIndex: 0,
              explanation: 'Explanation',
            },
          ],
          body: '# Lesson body',
        },
      ],
      questions: [
        {
          id: 'security-xss-01-q1',
          type: 'mcq',
          prompt: 'Question',
          choices: ['A', 'B'],
          answerIndex: 0,
          explanation: 'Explanation',
        },
      ],
    })
  })

  it.each([
    {
      name: 'an unknown domain directory',
      file: { ...topicFile(), relativePath: 'unknown/xss/index.md' },
    },
    {
      name: 'a topic that differs from its directory',
      file: topicFile('csrf'),
    },
    {
      name: 'a lesson domain that differs from its directory',
      file: lessonFile({ domain: 'frontend' }),
    },
    {
      name: 'a lesson topic that differs from its directory',
      file: lessonFile({ topic: 'csrf' }),
    },
    {
      name: 'a lessonId that differs from its filename',
      file: lessonFile({ lessonId: 'security-xss-02', questionId: 'security-xss-02-q1' }),
    },
    {
      name: 'a questionId with a wrong lesson prefix',
      file: lessonFile({ questionId: 'security-xss-02-q1' }),
    },
  ])('rejects $name and includes its relative path', ({ file }) => {
    expect(() => createContentBundle([file])).toThrow(file.relativePath)
  })

  it('rejects duplicate question IDs within one lesson', () => {
    const duplicate = lessonFile({
      questionIds: ['security-xss-01-q1', 'security-xss-01-q1'],
    })

    expect(() => createContentBundle([duplicate])).toThrow(
      'security/xss/security-xss-01.md: questionId "security-xss-01-q1" is also defined in "security/xss/security-xss-01.md"',
    )
  })

  it('rejects duplicate lessonIds globally before question IDs can mask the error', () => {
    const first = lessonFile()
    const second = {
      ...lessonFile({ domain: 'frontend', questionId: 'security-xss-01-q2' }),
      relativePath: 'frontend/xss/security-xss-01.md',
    }

    expect(() => createContentBundle([first, second])).toThrow(
      'security/xss/security-xss-01.md: lessonId "security-xss-01" is also defined in "frontend/xss/security-xss-01.md"',
    )
  })
})
