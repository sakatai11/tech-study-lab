import type { NextConfig } from 'next'

// Worker が返すすべての応答（静的な枠・SSR・404）に付ける最低限のセキュリティヘッダ（ADR-0024）。
// script-src などでスクリプトを制限する CSP と HSTS は含めない（理由と境界は ADR-0024）。
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
] as const

// Vinext が読み込む Next.js 互換設定。Cache Components と専用 cache 基盤は使わない（ADR-0019）。
const nextConfig: NextConfig = {
  async headers() {
    // Vinext の `/:path*` は `/` に一致しないため、`/` を含む全パスに一致する `/(.*)` を使う。
    return [{ source: '/(.*)', headers: [...securityHeaders] }]
  },
}

export default nextConfig
