import type { StorybookConfig } from '@storybook/react-vite'

// tailwind.config.ts が stories を走査対象に含めるための合図。
process.env.TSL_STORYBOOK = 'true'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {
      // アプリの vite.config.ts は vinext と Cloudflare のプラグインを起動するため読み込ませない。
      builder: { viteConfigPath: '.storybook/vite.config.ts' },
    },
  },
  // Material Symbols の SVG（public/icons/material-symbols/）をアプリと同じ URL で配信する。
  staticDirs: ['../public'],
  core: { disableTelemetry: true },
}

export default config
