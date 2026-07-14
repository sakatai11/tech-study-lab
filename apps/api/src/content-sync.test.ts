import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  type ContentSourceFile,
  createContentSyncPayload,
  createContentSyncSql,
  createLocalD1ExecuteArgs,
} from './content-sync'
import { FIXED_USER_ID } from './fixed-user'

const contentRoot = fileURLToPath(new URL('../../../content/', import.meta.url))

function xssContentFiles(): ContentSourceFile[] {
  return ['security/xss/index.md', 'security/xss/security-xss-01.md'].map((relativePath) => ({
    relativePath,
    source: readFileSync(join(contentRoot, relativePath), 'utf8'),
  }))
}

function topicSource(topic = 'xss'): string {
  return `---
topic: ${topic}
title: XSS
order: 0
---
`
}

function lessonSource({
  domain = 'security',
  topic = 'xss',
  lessonId = 'security-xss-01',
  questionId = 'security-xss-01-q1',
  answerIndex = 0,
}: {
  domain?: string
  topic?: string
  lessonId?: string
  questionId?: string
  answerIndex?: number
} = {}): string {
  return `---
domain: ${domain}
topic: ${topic}
lessonId: ${lessonId}
title: XSS
questions:
  - id: ${questionId}
    type: mcq
    prompt: Question
    choices:
      - A
      - B
    answerIndex: ${answerIndex}
    explanation: Explanation
---
`
}

describe('createContentSyncPayload', () => {
  it('extracts the three current XSS questions', () => {
    expect(createContentSyncPayload(xssContentFiles(), FIXED_USER_ID)).toEqual({
      userId: FIXED_USER_ID,
      questions: [
        { questionId: 'security-xss-01-q1', answerIndex: 0 },
        { questionId: 'security-xss-01-q2', answerIndex: 2 },
        { questionId: 'security-xss-01-q3', answerIndex: 2 },
      ],
    })
  })

  it.each([
    {
      name: 'unknown domain directory',
      file: { relativePath: 'unknown/xss/index.md', source: topicSource() },
    },
    {
      name: 'topic name that differs from its directory',
      file: { relativePath: 'security/xss/index.md', source: topicSource('csrf') },
    },
    {
      name: 'lesson domain that differs from its directory',
      file: {
        relativePath: 'security/xss/security-xss-01.md',
        source: lessonSource({ domain: 'frontend' }),
      },
    },
    {
      name: 'lesson topic that differs from its directory',
      file: {
        relativePath: 'security/xss/security-xss-01.md',
        source: lessonSource({ topic: 'csrf' }),
      },
    },
    {
      name: 'lessonId that differs from its filename',
      file: {
        relativePath: 'security/xss/security-xss-01.md',
        source: lessonSource({ lessonId: 'security-xss-02', questionId: 'security-xss-02-q1' }),
      },
    },
    {
      name: 'questionId with the wrong lesson prefix',
      file: {
        relativePath: 'security/xss/security-xss-01.md',
        source: lessonSource({ questionId: 'security-xss-02-q1' }),
      },
    },
    {
      name: 'answerIndex outside its choices',
      file: {
        relativePath: 'security/xss/security-xss-01.md',
        source: lessonSource({ answerIndex: 2 }),
      },
    },
  ])('rejects $name and reports its relative path', ({ file }) => {
    expect(() => createContentSyncPayload([file], FIXED_USER_ID)).toThrow(file.relativePath)
  })

  it('rejects duplicate questionIds across lessons before SQL generation', () => {
    const duplicateQuestionId = 'security-xss-01-q1'

    expect(() =>
      createContentSyncPayload(
        [
          {
            relativePath: 'security/xss/security-xss-01.md',
            source: lessonSource({ questionId: duplicateQuestionId, answerIndex: 0 }),
          },
          {
            relativePath: 'security/other/security-xss-01.md',
            source: lessonSource({
              topic: 'other',
              questionId: duplicateQuestionId,
              answerIndex: 1,
            }),
          },
        ],
        FIXED_USER_ID,
      ),
    ).toThrow(
      'security/xss/security-xss-01.md: questionId "security-xss-01-q1" is also defined in "security/other/security-xss-01.md"',
    )
  })
})

describe('createContentSyncSql', () => {
  it('creates only idempotent users and questions upserts', () => {
    const sql = createContentSyncSql(
      {
        userId: FIXED_USER_ID,
        questions: [{ questionId: 'security-xss-01-q1', answerIndex: 2 }],
      },
      1_700_000_000_000,
    )

    expect(sql).toContain('INSERT INTO users (id, created_at)')
    expect(sql).toContain('ON CONFLICT(id) DO NOTHING')
    expect(sql).toContain('INSERT INTO questions (question_id, answer_index)')
    expect(sql).toContain(
      'ON CONFLICT(question_id) DO UPDATE SET answer_index = excluded.answer_index',
    )
    expect(sql).not.toContain('DELETE')
  })
})

describe('createLocalD1ExecuteArgs', () => {
  it('uses a local-only wrangler command', () => {
    expect(createLocalD1ExecuteArgs('/tmp/content-sync.sql')).toEqual([
      'd1',
      'execute',
      'tech-study-lab',
      '--local',
      '--file',
      '/tmp/content-sync.sql',
    ])
  })
})
