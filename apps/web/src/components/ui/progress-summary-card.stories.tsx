import type { Meta, StoryObj } from '@storybook/react-vite'

import { ProgressSummaryCard } from './progress-summary-card'

const meta = {
  title: 'UI/ProgressSummaryCard',
  component: ProgressSummaryCard,
  args: {
    eyebrow: 'security',
    icon: 'security',
    title: 'セキュリティ',
    value: '50%',
    progressValue: 50,
    color: 'green',
    progressLabel: 'セキュリティ の習得状況',
    detail: '12問中6問習得 · 2トピック · 4レッスン',
    action: { href: '/learn/security/xss', label: '最初のトピック' },
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProgressSummaryCard>

export default meta
type Story = StoryObj<typeof meta>

export const WithLink: Story = {}

/** 教材がない領域は、リンクの代わりに操作できない表示を出す。 */
export const Preparing: Story = {
  args: {
    eyebrow: 'architecture',
    icon: 'account_tree',
    title: 'アーキテクチャ',
    value: '0%',
    progressValue: 0,
    color: 'orange',
    progressLabel: 'アーキテクチャ の習得状況',
    detail: '教材を準備しています',
    action: { disabledLabel: '準備中' },
  },
}

export const WithoutIcon: Story = { args: { icon: undefined } }
