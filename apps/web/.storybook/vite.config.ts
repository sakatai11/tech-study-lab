import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Storybook 専用の Vite 設定。アプリの vite.config.ts（vinext・Cloudflare プラグイン）とは共有しない。
 * Tailwind は apps/web/postcss.config.mjs を Vite が読み込んで適用する。
 */
export default defineConfig({
  // tsconfig.json の `jsx: preserve`（Next.js 向け）を引き継がせず、JSX を変換する。
  plugins: [react()],
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('../src', import.meta.url)) },
      // Next.js のランタイムがないため、画面遷移を行わない表示用の部品に差し替える。
      {
        find: /^next\/link$/,
        replacement: fileURLToPath(new URL('./mocks/next-link.tsx', import.meta.url)),
      },
    ],
  },
  define: {
    // lib/api.ts が参照する。stories は fetch を差し替えるため、実在しない宛先にする。
    'process.env.NEXT_PUBLIC_API_BASE_URL': JSON.stringify('http://storybook.invalid'),
  },
})
