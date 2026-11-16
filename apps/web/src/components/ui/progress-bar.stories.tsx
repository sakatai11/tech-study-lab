import type { Meta, StoryObj } from '@storybook/react-vite'

import { ProgressBar } from './progress-bar'

const meta = {
  title: 'UI/ProgressBar',
  component: ProgressBar,
  args: { label: 'セキュリティ の習得状況', value: 50, color: 'green' },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100 } },
    color: { control: 'inline-radio', options: ['green', 'blue', 'purple', 'orange'] },
  },
} satisfies Meta<typeof ProgressBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = { args: { value: 0 } }

export const Full: Story = { args: { value: 100 } }

export const Tones: Story = {
  render: () => (
    <div className="grid gap-4">
      <ProgressBar color="green" label="セキュリティ の習得状況" value={75} />
      <ProgressBar color="blue" label="フロントエンド の習得状況" value={50} />
      <ProgressBar color="purple" label="バックエンド の習得状況" value={25} />
      <ProgressBar color="orange" label="アーキテクチャ の習得状況" value={10} />
    </div>
  ),
}
