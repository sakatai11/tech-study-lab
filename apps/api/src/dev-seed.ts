import { DAY_MS, initialSrs, reviewSrs } from '@tsl/shared'

import type { ContentSyncQuestion } from './content-sync'
import { FIXED_USER_ID } from './fixed-user'

type SeededAnswer = {
  idSuffix: string
  isCorrect: boolean
  answeredAt: number
  responseTimeMs: number | null
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function answerLogSql({
  id,
  userId,
  questionId,
  isCorrect,
  answeredAt,
  responseTimeMs,
}: {
  id: string
  userId: string
  questionId: string
  isCorrect: boolean
  answeredAt: number
  responseTimeMs: number | null
}): string {
  const responseTimeValue = responseTimeMs === null ? 'NULL' : String(responseTimeMs)

  return `INSERT INTO answer_logs (id, user_id, question_id, is_correct, answered_at, response_time_ms) VALUES (${sqlString(id)}, ${sqlString(userId)}, ${sqlString(questionId)}, ${Number(isCorrect)}, ${answeredAt}, ${responseTimeValue}) ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, question_id = excluded.question_id, is_correct = excluded.is_correct, answered_at = excluded.answered_at, response_time_ms = excluded.response_time_ms`
}

/**
 * content sync と同じ検証済みの question ID から、固定ユーザーの開発用動的データを作る。
 * ファイルI/O・時刻取得・Wrangler 実行を持たないため、決定的にテストできる。
 */
export function createDevSeedSql(
  payload: {
    userId: string
    questions: Pick<ContentSyncQuestion, 'questionId' | 'answerIndex'>[]
  },
  seededAt: number,
): string {
  if (!Number.isSafeInteger(seededAt) || seededAt < 0) {
    throw new Error('seededAt must be a nonnegative safe integer')
  }
  if (payload.userId !== FIXED_USER_ID) {
    throw new Error('dev seed is limited to the fixed user')
  }

  const incorrectAnsweredAt = seededAt - 4 * DAY_MS
  const seededAnswers: readonly [SeededAnswer, SeededAnswer] = [
    {
      idSuffix: 'incorrect',
      isCorrect: false,
      answeredAt: incorrectAnsweredAt,
      responseTimeMs: null,
    },
    {
      idSuffix: 'correct',
      isCorrect: true,
      answeredAt: incorrectAnsweredAt + DAY_MS + 1,
      responseTimeMs: 1200,
    },
  ]
  const [firstSeededAnswer, ...remainingSeededAnswers] = seededAnswers
  const finalSrs = remainingSeededAnswers.reduce(
    (state, answer) => reviewSrs(state, answer.isCorrect, answer.answeredAt),
    reviewSrs(initialSrs(), firstSeededAnswer.isCorrect, firstSeededAnswer.answeredAt),
  )
  const finalVersion = seededAnswers.length
  const questionIds = payload.questions
    .map((question) => question.questionId)
    .sort((left, right) => left.localeCompare(right, 'en'))
  const userId = sqlString(payload.userId)

  const statements = [
    `DELETE FROM answer_logs WHERE user_id = ${userId}`,
    `DELETE FROM srs_states WHERE user_id = ${userId}`,
    `INSERT INTO users (id, created_at) VALUES (${userId}, ${seededAt}) ON CONFLICT(id) DO NOTHING`,
    ...questionIds.flatMap((questionId) => [
      `INSERT INTO srs_states (user_id, question_id, ease, interval_days, due_at, reps, lapses, version) VALUES (${userId}, ${sqlString(questionId)}, ${finalSrs.ease}, ${finalSrs.intervalDays}, ${finalSrs.dueAt}, ${finalSrs.reps}, ${finalSrs.lapses}, ${finalVersion}) ON CONFLICT(user_id, question_id) DO UPDATE SET ease = excluded.ease, interval_days = excluded.interval_days, due_at = excluded.due_at, reps = excluded.reps, lapses = excluded.lapses, version = excluded.version`,
      ...seededAnswers.map((answer) =>
        answerLogSql({
          id: `${payload.userId}:dev-seed:${questionId}:${answer.idSuffix}`,
          userId: payload.userId,
          questionId,
          isCorrect: answer.isCorrect,
          answeredAt: answer.answeredAt,
          responseTimeMs: answer.responseTimeMs,
        }),
      ),
    ]),
  ]

  return `${statements.join(';\n')};`
}

/**
 * 任意引数を転送せず、ローカル D1 にしか接続しない Wrangler 引数を固定する。
 */
export function createLocalDevSeedD1ExecuteArgs(filePath: string): readonly string[] {
  return ['d1', 'execute', 'tech-study-lab', '--local', '--file', filePath]
}
