import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import type { Preview } from '@storybook/react-vite'
import { useEffect } from 'react'

import '../src/app/globals.css'
import './preview.css'

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'テーマ（html[data-theme]）',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'dark', title: 'Dark', icon: 'moon' },
          { value: 'light', title: 'Light', icon: 'sun' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'dark' },
  parameters: {
    layout: 'fullscreen',
    // 背景はテーマのトークン（--bg）で決めるため、Storybook 側の背景切替は使わない。
    backgrounds: { disable: true },
    controls: { expanded: true },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme === 'light' ? 'light' : 'dark'
      useEffect(() => {
        document.documentElement.dataset.theme = theme
      }, [theme])

      return (
        <div className="p-4 sm:p-6">
          <Story />
        </div>
      )
    },
  ],
}

export default preview
