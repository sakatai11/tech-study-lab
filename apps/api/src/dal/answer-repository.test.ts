import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it } from 'vitest'

import { createAnswerDeps } from './answer-repository'

type CapturedStatement = {
  sql: string
  values: unknown[]
}

class CapturingStatement implements D1PreparedStatement {
  constructor(
    readonly sql: string,
    readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new CapturingStatement(this.sql, values)
  }

  async first<T = unknown>(_colName?: string): Promise<T | null> {
    return null
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    throw new Error('recordAnswer must use D1 batch instead of individual statements')
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return {
      success: true,
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: 0,
        last_row_id: 0,
        changed_db: false,
        changes: 0,
      },
      results: [],
    }
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>
  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    return options?.columnNames ? ([[]] as [string[], ...T[]]) : []
  }
}

class CapturingD1Database implements D1Database, D1DatabaseSession {
  readonly batches: CapturedStatement[][] = []
  readonly batchError = new Error('D1 batch failed')

  prepare(query: string): D1PreparedStatement {
    return new CapturingStatement(query)
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.batches.push(
      statements.map((statement) => {
        if (!(statement instanceof CapturingStatement)) {
          throw new Error('Expected the test D1 statement implementation')
        }

        return { sql: statement.sql, values: statement.values }
      }),
    )
    throw this.batchError
  }

  async exec(): Promise<D1ExecResult> {
    return { count: 0, duration: 0 }
  }

  withSession(): D1DatabaseSession {
    return this
  }

  async dump(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0)
  }

  getBookmark(): D1SessionBookmark | null {
    return null
  }
}

describe('createAnswerDeps', () => {
  it('sends both answer-log and SRS writes in one D1 batch and propagates its failure', async () => {
    const client = new CapturingD1Database()
    const deps = createAnswerDeps(drizzle(client))

    await expect(
      deps.recordAnswer({
        userId: 'user-1',
        questionId: 'question-1',
        isCorrect: true,
        answeredAt: 1_700_000_000_000,
        responseTimeMs: 800,
        expectedVersion: 0,
        nextSrs: {
          ease: 2500,
          intervalDays: 1,
          dueAt: 1_700_086_400_000,
          reps: 1,
          lapses: 0,
        },
      }),
    ).rejects.toBe(client.batchError)

    expect(client.batches).toHaveLength(1)
    expect(client.batches[0]).toHaveLength(2)
    expect(client.batches[0]?.map((statement) => statement.sql)).toEqual([
      expect.stringContaining('insert into "srs_states"'),
      expect.stringContaining('insert into "answer_logs"'),
    ])
  })
})
