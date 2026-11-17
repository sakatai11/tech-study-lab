import type { Meta, StoryObj } from '@storybook/react-vite'

import { Callout } from './callout'

const meta = {
  title: 'UI/Callout',
  component: Callout,
  args: {
    type: 'note',
    children: <p>ブラウザは、同じオリジンのスクリプトだけに DOM の読み書きを許可します。</p>,
  },
  // 教材本文（.markdown-body）の中で使う。余白の指定は本文側の CSS が持つ。
  decorators: [
    (Story) => (
      <div className="markdown-body">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    type: { control: 'inline-radio', options: ['note', 'tip', 'warning', 'caution'] },
    children: { control: false },
  },
} satisfies Meta<typeof Callout>

export default meta
type Story = StoryObj<typeof meta>

export const Note: Story = {}

export const Tip: Story = { args: { type: 'tip' } }

export const Warning: Story = { args: { type: 'warning' } }

export const Caution: Story = { args: { type: 'caution' } }
