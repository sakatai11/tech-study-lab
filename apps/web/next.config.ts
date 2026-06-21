import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default nextConfig

// OpenNext: next dev 中も Cloudflare のバインディングへアクセスできるようにする
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

initOpenNextCloudflareForDev()
