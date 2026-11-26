import type { NextConfig } from 'next'

// Worker が返すすべての応答（静的な枠・SSR・404）に付ける最低限のセキュリティヘッダ（Issue #325）。
// 静的な枠も Worker が返すため、Worker の応答に効かない静的アセットの `_headers` ではなくここで付ける。
// script-src などでスクリプトを制限する CSP は、インラインのテーマスクリプトに nonce か hash が要るため含めない。
// HSTS は HTTPS の強制とあわせて Cloudflare のゾーン設定が持つため、Worker では重ねない。
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
