import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { LoadErrorCard, LoadingCard, RefreshErrorNotice } from './load-state'

const meta = {
  title: 'UI/LoadState',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Loading: Story = {
  render: () => <LoadingCard label="学習状況を読み込んでいます" />,
}

export const LoadError: Story = {
  render: () => (
    <LoadErrorCard
      code="dashboard_unavailable"
      links={[
        { href: '/learn', label: '教材を読む' },
        { href: '/quiz', label: '演習一覧へ' },
      ]}
      message="時間をおいて再読み込みしてください。"
      onRetry={fn()}
      title="学習状況を読み込めませんでした"
    />
  ),
}

export const RefreshError: Story = {
  render: () => <RefreshErrorNotice onRetry={fn()} />,
}
