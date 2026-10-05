import path from 'node:path'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'

// pnpm monorepo のルートを明示し、Turbopack がホームディレクトリの
// package-lock.json を誤検知するのを防ぐ
// path.resolve で正規化しないと Turbopack がパスを誤計算する
const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(import.meta.dirname, '../..'),
  },
}

export default nextConfig

// Vinext も next.config.ts を読み込み、OpenNext の Miniflare proxy が Vite process を終了できなくするため Vinext 時は初期化しない。
if (!process.env.VINEXT) initOpenNextCloudflareForDev()
