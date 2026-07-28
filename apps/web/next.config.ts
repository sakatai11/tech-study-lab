import path from 'node:path'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'

// pnpm monorepo のルートを明示し、Turbopack がホームディレクトリの
// package-lock.json を誤検知するのを防ぐ
// path.resolve で正規化しないと Turbopack がパスを誤計算する
const nextConfig: NextConfig = {
  // Cache Components はアプリ全体に効く top-level switch（design.md 7.2）
  cacheComponents: true,
  turbopack: {
    root: path.resolve(import.meta.dirname, '../..'),
  },
}

export default nextConfig

initOpenNextCloudflareForDev()
