import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { Button } from './button'
import { MaterialSymbol } from './material-symbol'

const meta = {
  title: 'UI/Button',
  component: Button,
  args: { children: '演習を開始', onClick: fn() },
  argTypes: { variant: { control: 'inline-radio', options: ['green', 'blue', 'ghost'] } },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Green: Story = { args: { variant: 'green' } }

export const Blue: Story = { args: { variant: 'blue', children: '再読み込み' } }

export const Ghost: Story = { args: { variant: 'ghost', children: 'すべて解き直す' } }

export const Disabled: Story = {
  args: { variant: 'blue', disabled: true, children: '間違えた問題を解き直す' },
}

export const WithIcon: Story = {
  render: (args) => (
    <Button {...args}>
      演習を開始
      <MaterialSymbol className="size-5" name="arrow_forward" />
    </Button>
  ),
}
