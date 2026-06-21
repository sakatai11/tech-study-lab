import { Hono } from 'hono'

const app = new Hono()

// 最小エントリ: ヘルスチェックのみ。主要API（教材・解答ログ・SRS）はアーキ設計確定後に実装する
const routes = app.get('/health', (c) => c.json({ status: 'ok' as const }))

// hc（型安全RPC）でフロントと共有する型
export type AppType = typeof routes

export default app
