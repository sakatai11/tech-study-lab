import type { Meta, StoryObj } from '@storybook/react-vite'

import { Badge } from './badge'

const meta = {
  title: 'UI/Badge',
  component: Badge,
  args: { children: '5問' },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Keycap: Story = {
  args: { keycap: '1', children: 'キーで解答' },
}

/** 状態を示すバッジは、淡色の地と同系色の文字を className で渡す。 */
export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Badge className="border-green bg-green-bg text-green">PASS</Badge>
      <Badge className="border-red bg-red-bg text-red">FAIL</Badge>
      <Badge className="border-blue bg-blue-bg text-blue">1〜4キーで解答</Badge>
      <Badge className="border-purple bg-purple-bg text-purple">最大20問</Badge>
    </div>
  ),
}
