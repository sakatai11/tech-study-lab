import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * 動的データのみ D1 に持つ。教材・問題本文は content/ の Markdown が一次ソースで、
 * ここには「どの問題に解答したか」「SRS 状態」だけを保存する。
 */

// 将来公開を見据え、初期の単一ユーザーでも user_id を持たせる。
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

// 解答ログ。SRS の入力であり、解答率分析の元データ。
export const answerLogs = sqliteTable('answer_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  questionId: text('question_id').notNull(),
  isCorrect: integer('is_correct', { mode: 'boolean' }).notNull(),
  answeredAt: integer('answered_at', { mode: 'timestamp_ms' }).notNull(),
  responseTimeMs: integer('response_time_ms'),
})

// content/ の問題データを正誤判定用に同期する最小キャッシュ。
export const questions = sqliteTable('questions', {
  questionId: text('question_id').primaryKey(),
  answerIndex: integer('answer_index').notNull(),
})

// 問題ごとの SRS 状態（SM-2 パラメータ）。出題制御の中核。
export const srsStates = sqliteTable(
  'srs_states',
  {
    userId: text('user_id').notNull(),
    questionId: text('question_id').notNull(),
    ease: integer('ease').notNull(), // ease factor を 1000 倍した整数（2.5 → 2500）
    intervalDays: integer('interval_days').notNull(),
    dueAt: integer('due_at', { mode: 'timestamp_ms' }).notNull(),
    reps: integer('reps').notNull(),
    lapses: integer('lapses').notNull(),
    version: integer('version').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.questionId] }),
  }),
)

// 教材本文の閲覧ログ。簡易アナリティクス用に最小情報だけを持つ。
export const lessonViews = sqliteTable('lesson_views', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  lessonId: text('lesson_id').notNull(),
  viewedAt: integer('viewed_at', { mode: 'timestamp_ms' }).notNull(),
})

export type User = typeof users.$inferSelect
export type AnswerLog = typeof answerLogs.$inferSelect
export type QuestionRow = typeof questions.$inferSelect
export type SrsState = typeof srsStates.$inferSelect
export type LessonView = typeof lessonViews.$inferSelect
