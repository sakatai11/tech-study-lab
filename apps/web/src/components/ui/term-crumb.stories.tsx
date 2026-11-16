import type { Meta, StoryObj } from '@storybook/react-vite'

import { TermCrumb } from './term-crumb'

const meta = {
  title: 'UI/TermCrumb',
  component: TermCrumb,
  args: { command: 'cat learn/security/xss' },
} satisfies Meta<typeof TermCrumb>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
