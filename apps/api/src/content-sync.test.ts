import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  CONTENT_SYNC_REMOTE_CONFIRMATION_PHRASE,
  type ContentSourceFile,
  createContentSyncPayload,
  createContentSyncSql,
  createContentSyncSqlSummary,
  createLocalD1ExecuteArgs,
  createRemoteD1ExecuteArgs,
  isContentSyncRemoteConfirmation,
  parseContentSyncExecutionMode,
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
        {
          questionId: 'security-xss-01-q1',
          answerIndex: 0,
          domain: 'security',
          topic: 'xss',
          lessonId: 'security-xss-01',
        },
        {
          questionId: 'security-xss-01-q2',
          answerIndex: 2,
          domain: 'security',
          topic: 'xss',
          lessonId: 'security-xss-01',
        },
        {
          questionId: 'security-xss-01-q3',
          answerIndex: 2,
          domain: 'security',
          topic: 'xss',
          lessonId: 'security-xss-01',
        },
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

  it('rejects duplicate lessonIds across paths before SQL generation', () => {
    expect(() =>
      createContentSyncPayload(
        [
          {
            relativePath: 'security/xss/security-xss-01.md',
            source: lessonSource({ questionId: 'security-xss-01-q1', answerIndex: 0 }),
          },
          {
            relativePath: 'security/other/security-xss-01.md',
            source: lessonSource({
              topic: 'other',
              questionId: 'security-xss-01-q2',
              answerIndex: 1,
            }),
          },
        ],
        FIXED_USER_ID,
      ),
    ).toThrow(
      'security/xss/security-xss-01.md: lessonId "security-xss-01" is also defined in "security/other/security-xss-01.md"',
    )
  })
})

describe('createContentSyncSql', () => {
  it('upserts current metadata and finalizes active membership in one update', () => {
    const sql = createContentSyncSql(
      {
        userId: FIXED_USER_ID,
        questions: [
          {
            questionId: 'security-xss-01-q1',
            answerIndex: 2,
            domain: 'security',
            topic: 'xss',
            lessonId: 'security-xss-01',
          },
        ],
      },
      1_700_000_000_000,
    )

    expect(sql).toContain('INSERT INTO users (id, created_at)')
    expect(sql).toContain('ON CONFLICT(id) DO NOTHING')
    expect(sql).toContain(
      'INSERT INTO questions (question_id, answer_index, domain, topic, lesson_id, is_active)',
    )
    expect(sql).toContain(
      'ON CONFLICT(question_id) DO UPDATE SET answer_index = excluded.answer_index, domain = excluded.domain, topic = excluded.topic, lesson_id = excluded.lesson_id, is_active = excluded.is_active',
    )
    expect(sql).toContain(
      "UPDATE questions SET is_active = CASE WHEN question_id IN ('security-xss-01-q1') THEN 1 ELSE 0 END",
    )
    expect(sql).not.toContain('DELETE')
  })

  it('marks all existing questions inactive when the current content set is empty', () => {
    expect(
      createContentSyncSql({ userId: FIXED_USER_ID, questions: [] }, 1_700_000_000_000),
    ).toContain('UPDATE questions SET is_active = 0')
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

describe('createRemoteD1ExecuteArgs', () => {
  it('uses the configured production database and remote-only wrangler command', () => {
    expect(createRemoteD1ExecuteArgs('/tmp/content-sync.sql')).toEqual([
      'd1',
      'execute',
      'tech-study-lab',
      '--remote',
      '--file',
      '/tmp/content-sync.sql',
    ])
  })
})

describe('parseContentSyncExecutionMode', () => {
  it.each([
    { args: ['--local'], expected: 'local' },
    { args: ['--remote'], expected: 'remote' },
  ] as const)('accepts only the exact $expected mode arguments', ({ args, expected }) => {
    expect(parseContentSyncExecutionMode(args)).toBe(expected)
  })

  it.each([
    { args: [] },
    { args: ['--unknown'] },
    { args: ['--local', '--remote'] },
    { args: ['--remote', '--local'] },
    { args: ['--remote', '--file', '/tmp/other.sql'] },
  ])('rejects unknown or extra arguments before execution: %j', ({ args }) => {
    expect(() => parseContentSyncExecutionMode(args)).toThrow('exactly one of --local or --remote')
  })
})

describe('createContentSyncSqlSummary', () => {
  it('reports deterministic question and SQL statement counts', () => {
    expect(
      createContentSyncSqlSummary({
        userId: FIXED_USER_ID,
        questions: [
          {
            questionId: 'security-xss-01-q1',
            answerIndex: 0,
            domain: 'security',
            topic: 'xss',
            lessonId: 'security-xss-01',
          },
          {
            questionId: 'security-xss-01-q2',
            answerIndex: 2,
            domain: 'security',
            topic: 'xss',
            lessonId: 'security-xss-01',
          },
        ],
      }),
    ).toEqual({ questionCount: 2, statementCount: 4 })
  })
})

describe('isContentSyncRemoteConfirmation', () => {
  it('accepts only the exact fixed confirmation phrase', () => {
    expect(isContentSyncRemoteConfirmation(CONTENT_SYNC_REMOTE_CONFIRMATION_PHRASE)).toBe(true)
  })

  it.each([
    '',
    'SYNC tech-study-lab',
    `${CONTENT_SYNC_REMOTE_CONFIRMATION_PHRASE} `,
    ` ${CONTENT_SYNC_REMOTE_CONFIRMATION_PHRASE}`,
  ])('rejects a non-exact confirmation phrase: %j', (confirmation) => {
    expect(isContentSyncRemoteConfirmation(confirmation)).toBe(false)
  })
})
