import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { QuizInteractive } from './quiz-interactive'

const questions = [
  {
    id: 'security-xss-01-q1',
    prompt: 'ユーザー入力を HTML に埋め込むとき、XSS を防ぐために最初に行うべき対策はどれか。',
    choices: [
      '出力する文脈に合わせてエスケープする',
      '入力欄の maxlength を短くする',
      'Cookie の有効期限を短くする',
      'JavaScript を圧縮して配信する',
    ],
  },
  {
    id: 'security-xss-01-q2',
    prompt: 'DOM-based XSS の原因になりやすい API はどれか。',
    choices: ['innerHTML', 'textContent', 'setAttribute("title", …)', 'classList.add'],
  },
]

/**
 * 解答の送信先（POST /answers）を差し替える。どの問題も 1 番の選択肢を正解として採点する。
 * API を起動せずに `intro → exercise → result` を操作できるようにするためで、採点の正しさは検証しない。
 */
function mockAnswerApi() {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_input, init) => {
    const { selectedIndex } = JSON.parse(String(init?.body)) as { selectedIndex: number }
    return Response.json({ isCorrect: selectedIndex === 0, correctIndex: 0 })
  }
  return () => {
    globalThis.fetch = originalFetch
  }
}

const meta = {
  title: 'Features/Quiz/QuizInteractive',
  component: QuizInteractive,
  args: {
    title: 'XSS の基礎',
    questions,
    explanations: {
      'security-xss-01-q1':
        'HTML の本文・属性値・JavaScript など、出力先の文脈ごとに必要なエスケープが異なります。',
      'security-xss-01-q2':
        'innerHTML は文字列を HTML として解釈するため、入力がそのまま実行されます。',
    },
    resultHomeHref: '/learn/security/xss',
    resultHomeLabel: 'レッスン一覧へ',
  },
  beforeEach: mockAnswerApi,
} satisfies Meta<typeof QuizInteractive>

export default meta
type Story = StoryObj<typeof meta>

export const Intro: Story = {}

export const Empty: Story = { args: { questions: [] } }

export const Exercise: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '演習を開始' }))
    await expect(canvas.getByText('quiz / exercise')).toBeVisible()
  },
}

/** 1 問目を正解、2 問目を不正解にして結果サマリまで進める。 */
export const Result: Story = {
  args: { nextLessonId: 'security-xss-02' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '演習を開始' }))
    await userEvent.click(canvas.getByRole('button', { name: /^1番/ }))
    await userEvent.click(await canvas.findByRole('button', { name: '次へ' }))
    await userEvent.click(await canvas.findByRole('button', { name: /^2番/ }))
    await userEvent.click(await canvas.findByRole('button', { name: '結果を見る' }))
    await expect(canvas.getByRole('heading', { name: '演習完了' })).toBeVisible()
  },
}

/** 復習（/review）での表示。残りのバッチがあると「続けて復習する」を出す。 */
export const ReviewResult: Story = {
  args: {
    eyebrowPrefix: 'review',
    hasMore: true,
    introStartLabel: '復習を開始',
    onComplete: fn(),
    resultHomeHref: '/home',
    resultHomeLabel: 'ホームへ',
    resultTitle: '復習完了',
    title: '今日の復習',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '復習を開始' }))
    await userEvent.click(canvas.getByRole('button', { name: /^1番/ }))
    await userEvent.click(await canvas.findByRole('button', { name: '次へ' }))
    await userEvent.click(await canvas.findByRole('button', { name: /^1番/ }))
    await userEvent.click(await canvas.findByRole('button', { name: '結果を見る' }))
    await expect(canvas.getByRole('heading', { name: '復習完了' })).toBeVisible()
  },
}
