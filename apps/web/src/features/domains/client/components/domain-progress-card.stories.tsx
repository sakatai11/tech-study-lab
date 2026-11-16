import type { Meta, StoryObj } from '@storybook/react-vite'

import { DomainProgressCard } from './domain-progress-card'

const meta = {
  title: 'Features/Domains/DomainProgressCard',
  component: DomainProgressCard,
  args: {
    domain: {
      domain: 'security',
      label: 'セキュリティ',
      masteredQuestionCount: 6,
      totalQuestionCount: 12,
      masteryRate: 50,
      topicCount: 2,
      lessonCount: 4,
      firstTopicHref: '/learn/security/xss',
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DomainProgressCard>

export default meta
type Story = StoryObj<typeof meta>

export const WithContent: Story = {}

/** 教材がまだない領域。 */
export const Preparing: Story = {
  args: {
    domain: {
      domain: 'architecture',
      label: 'アーキテクチャ設計',
      masteredQuestionCount: 0,
      totalQuestionCount: 0,
      masteryRate: 0,
      topicCount: 0,
      lessonCount: 0,
    },
  },
}
