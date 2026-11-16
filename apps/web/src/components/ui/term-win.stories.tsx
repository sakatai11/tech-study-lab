import type { Meta, StoryObj } from '@storybook/react-vite'

import { TermWin } from './term-win'

const meta = {
  title: 'UI/TermWin',
  component: TermWin,
  args: {
    title: 'escape.ts',
    children: (
      <pre>
        <code>{'element.textContent = userInput'}</code>
      </pre>
    ),
  },
  // 教材本文（.markdown-body）のコードブロックとして使う。pre の見た目は本文側の CSS が持つ。
  decorators: [
    (Story) => (
      <div className="markdown-body">
        <Story />
      </div>
    ),
  ],
  argTypes: { children: { control: false }, status: { control: false } },
} satisfies Meta<typeof TermWin>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithMeta: Story = { args: { meta: 'typescript' } }

/** 教材の悪い例・良い例は、タイトルの右に状態を表示する。 */
export const WithStatus: Story = { args: { status: 'PASS', meta: 'typescript' } }
