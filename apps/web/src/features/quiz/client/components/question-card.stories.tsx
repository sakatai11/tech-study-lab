import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { QuestionCard } from './question-card'

const meta = {
  title: 'Features/Quiz/QuestionCard',
  component: QuestionCard,
  args: {
    question: {
      id: 'security-xss-01-q1',
      prompt: 'ユーザー入力を HTML に埋め込むとき、XSS を防ぐために最初に行うべき対策はどれか。',
      choices: [
        '出力する文脈に合わせてエスケープする',
        '入力欄の maxlength を短くする',
        'Cookie の有効期限を短くする',
        'JavaScript を圧縮して配信する',
      ],
    },
    explanation:
      'HTML の本文・属性値・JavaScript など、出力先の文脈ごとに必要なエスケープが異なります。',
    nextLabel: '次へ',
    submitting: false,
    onAnswer: fn(),
    onNext: fn(),
  },
} satisfies Meta<typeof QuestionCard>

export default meta
type Story = StoryObj<typeof meta>

export const Waiting: Story = {}

/** 送信中は選択肢をロックし、採点中であることを表示する。 */
export const Submitting: Story = { args: { submitting: true } }

export const Correct: Story = {
  args: { result: { isCorrect: true, correctIndex: 0, selectedIndex: 0 } },
}

export const Incorrect: Story = {
  args: { result: { isCorrect: false, correctIndex: 0, selectedIndex: 2 } },
}

export const LastQuestion: Story = {
  args: { nextLabel: '結果を見る', result: { isCorrect: true, correctIndex: 0, selectedIndex: 0 } },
}
