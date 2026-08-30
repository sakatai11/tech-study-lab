import { type ErrorHandler, Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'

import type { AppEnv } from './env'
import { type AccessTokenVerifier, createAccessBoundary } from './middleware/access-boundary'
import { userContext } from './middleware/user-context'
import type { PlatformRateLimiter } from './persistent-write-rate-limit'
import { createAnswersRoute } from './routes/answers'
import { dashboardRoute } from './routes/dashboard'
import { domainsRoute } from './routes/domains'
import { createLessonViewsRoute } from './routes/lesson-views'
import { reviewRoute } from './routes/review'
import { QuestionNotFoundError } from './services/errors'

export const apiErrorHandler: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof QuestionNotFoundError) {
    return c.json(
      {
        error: {
          code: 'QUESTION_NOT_FOUND',
          message: error.message,
        },
      },
      404,
    )
  }

  if (error instanceof HTTPException) {
    return error.getResponse()
  }

  console.error(error)
  return c.json(
    {
      error: {
        code: 'INTERNAL',
        message: 'Internal Server Error',
      },
    },
    500,
  )
}

export type PersistentWriteRateLimiters = {
  answers: PlatformRateLimiter
  lessonViews: PlatformRateLimiter
}

type ApiAppOptions = {
  rateLimiters?: PersistentWriteRateLimiters
}

function createUserRoutes({ rateLimiters }: ApiAppOptions = {}) {
  return new Hono<AppEnv>()
    .route('/answers', createAnswersRoute({ rateLimiter: rateLimiters?.answers }))
    .route('/lesson-views', createLessonViewsRoute({ rateLimiter: rateLimiters?.lessonViews }))
    .route('/review', reviewRoute)
    .route('/dashboard', dashboardRoute)
    .route('/domains', domainsRoute)
}

export function createInternalApiApp(options?: ApiAppOptions) {
  return new Hono<AppEnv>()
    .onError(apiErrorHandler)
    .use('*', userContext)
    .route('/', createUserRoutes(options))
}

export function createPublicApiApp(
  accessTokenVerifier?: AccessTokenVerifier,
  options?: ApiAppOptions,
) {
  return new Hono<AppEnv>()
    .onError(apiErrorHandler)
    .use(
      '*',
      cors({
        allowHeaders: ['Content-Type'],
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        credentials: true,
        origin: (origin, c) => (origin === c.env.WEB_ORIGIN ? origin : null),
      }),
    )
    .get('/health', (c) => c.json({ status: 'ok' as const }))
    .use('*', createAccessBoundary(accessTokenVerifier))
    .use('*', userContext)
    .route('/', createUserRoutes(options))
}

const app = createPublicApiApp()

// hc（型安全RPC）でフロントと共有する型
export type AppType = typeof app

export default app
