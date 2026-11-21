import type { Meta, StoryObj } from '@storybook/react-vite'

import { MaterialSymbol, materialSymbolNames } from './material-symbol'

const meta = {
  title: 'UI/MaterialSymbol',
  component: MaterialSymbol,
  args: { name: 'home' },
  argTypes: { name: { control: 'select', options: materialSymbolNames } },
} satisfies Meta<typeof MaterialSymbol>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** 文字色を継承する。サイズは className で指定する（docs/design-system.md のアイコンサイズ）。 */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-end gap-4 text-blue">
      <MaterialSymbol {...args} className="size-4" />
      <MaterialSymbol {...args} className="size-5" />
      <MaterialSymbol {...args} />
      <MaterialSymbol {...args} className="size-7" />
    </div>
  ),
}

/** `public/icons/material-symbols/` に同梱しているアイコンの一覧。 */
export const Catalog: Story = {
  render: () => (
    <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
      {materialSymbolNames.map((name) => (
        <li
          className="flex items-center gap-3 rounded-xl border-2 border-border bg-surface px-3 py-2 text-ink"
          key={name}
        >
          <MaterialSymbol name={name} />
          <span className="min-w-0 truncate font-mono text-xs text-mute">{name}</span>
        </li>
      ))}
    </ul>
  ),
}
