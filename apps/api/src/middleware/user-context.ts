import { createMiddleware } from 'hono/factory'

import type { AppEnv } from '../env'
import { FIXED_USER_ID } from '../fixed-user'

/**
 * API が権威的に扱う固定ユーザーを request context に注入する。
 * クライアントから送られる userId は利用しない。
 */
export const userContext = createMiddleware<AppEnv>(async (c, next) => {
  c.set('userId', FIXED_USER_ID)
  await next()
})
