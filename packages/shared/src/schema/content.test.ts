import { describe, expect, it } from 'vitest'

import {
  DOMAIN_LABELS,
  domainKeySchema,
  lessonIdSchema,
  questionIdSchema,
  topicFrontmatterSchema,
  validatedLessonFrontmatterSchema,
} from './content'

const validQuestion = {
  type: 'mcq' as const,
  prompt: 'What is XSS?',
  choices: ['A vulnerability', 'A framework'],
  answerIndex: 0,
  explanation: 'XSS is a vulnerability.',
}

const validLessonFrontmatter = {
  domain: 'security' as const,
  topic: 'xss',
  lessonId: 'security-xss-01',
  title: 'XSS basics',
  questions: [
    {
      id: 'security-xss-01-q1',
      ...validQuestion,
    },
    {
      id: 'security-xss-01-q2',
      ...validQuestion,
    },
  ],
}

describe('topicFrontmatterSchema', () => {
  it('accepts valid topic frontmatter', () => {
    expect(
      topicFrontmatterSchema.safeParse({
        topic: 'xss',
        title: 'XSS',
        order: 1,
      }).success,
    ).toBe(true)
  })

  it('rejects invalid topic frontmatter', () => {
    expect(
      topicFrontmatterSchema.safeParse({
        topic: '',
        title: 'XSS',
        order: 1,
      }).success,
    ).toBe(false)

    expect(
      topicFrontmatterSchema.safeParse({
        topic: 'xss',
        title: '',
        order: 1,
      }).success,
    ).toBe(false)

    expect(
      topicFrontmatterSchema.safeParse({
        topic: 'xss',
        title: 'XSS',
        order: -1,
      }).success,
    ).toBe(false)

    expect(
      topicFrontmatterSchema.safeParse({
        topic: 'xss',
        title: 'XSS',
        order: 1.5,
      }).success,
    ).toBe(false)
  })
})

describe('lessonIdSchema and questionIdSchema', () => {
  it('accept valid ids', () => {
    expect(lessonIdSchema.safeParse('security-xss-01').success).toBe(true)
    expect(questionIdSchema.safeParse('security-xss-01-q1').success).toBe(true)
  })

  it('reject invalid ids', () => {
    const invalidIds = ['Security-xss-01', 'security_xss_01', '', '日本語']

    for (const id of invalidIds) {
      expect(lessonIdSchema.safeParse(id).success).toBe(false)
      expect(questionIdSchema.safeParse(id).success).toBe(false)
    }
  })
})

describe('validatedLessonFrontmatterSchema', () => {
  it('accepts questions whose ids share the lesson prefix', () => {
    expect(validatedLessonFrontmatterSchema.safeParse(validLessonFrontmatter).success).toBe(true)
  })

  it('rejects questions whose ids use a different lesson prefix', () => {
    const result = validatedLessonFrontmatterSchema.safeParse({
      ...validLessonFrontmatter,
      questions: [
        {
          ...validLessonFrontmatter.questions[0],
          id: 'security-xss-02-q1',
        },
      ],
    })

    expect(result.success).toBe(false)
    if (result.success) {
      throw new Error('expected validation failure')
    }

    expect(result.error.issues[0]?.path).toEqual(['questions', 0, 'id'])
  })
})

describe('DOMAIN_LABELS', () => {
  it('covers every domain key and uses unique display orders', () => {
    expect(Object.keys(DOMAIN_LABELS).sort()).toEqual([...domainKeySchema.options].sort())

    const orders = Object.values(DOMAIN_LABELS)
      .map((value) => value.order)
      .sort((a, b) => a - b)

    expect(orders).toEqual([1, 2, 3, 4])
    expect(new Set(orders).size).toBe(4)
  })
})
