import type { Meta, StoryObj } from '@storybook/react-vite'

import { Card } from '@/components/ui/card'

import { ReviewIntro } from './review-intro'

const meta = {
  title: 'Features/Review/ReviewIntro',
  component: ReviewIntro,
  args: {
    dueCount: 3,
    previews: [
      { questionId: 'security-xss-01-q1', overdueDays: 4 },
      { questionId: 'security-xss-01-q2', overdueDays: 1 },
      { questionId: 'security-csrf-01-q1', overdueDays: 0 },
    ],
  },
  // 画面では QuizInteractive のイントロ（Card）の中に表示する。
  decorators: [
    (Story) => (
      <Card className="p-5 sm:p-7">
        <Story />
      </Card>
    ),
  ],
} satisfies Meta<typeof ReviewIntro>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
