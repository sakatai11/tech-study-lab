import type { Meta, StoryObj } from '@storybook/react-vite'

import { Card } from './card'

const meta = {
  title: 'UI/Card',
  component: Card,
  args: {
    className: 'p-5 sm:p-6',
    children: (
      <>
        <h3 className="m-0 text-xl font-black text-ink">クロスサイトスクリプティング</h3>
        <p className="mb-0 mt-3 text-sm text-mute">3レッスン · 12問</p>
      </>
    ),
  },
  argTypes: { children: { control: false } },
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** 失敗の表示では境界線の色を className で上書きする。 */
export const ErrorBorder: Story = { args: { className: 'border-red p-5 sm:p-6' } }
