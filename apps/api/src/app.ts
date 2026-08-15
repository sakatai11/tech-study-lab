import { type ErrorHandler, Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'

import type { AppEnv } from './env'
import { type AccessTokenVerifier, createAccessBoundary } from './middleware/access-boundary'
import { userContext } from './middleware/user-context'
import { answersRoute } from './routes/answers'
import { dashboardRoute } from './routes/dashboard'
import { lessonViewsRoute } from './routes/lesson-views'
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

const userRoutes = new Hono<AppEnv>()
  .route('/answers', answersRoute)
  .route('/lesson-views', lessonViewsRoute)
  .route('/review', reviewRoute)
  .route('/dashboard', dashboardRoute)

export function createInternalApiApp() {
  return new Hono<AppEnv>().onError(apiErrorHandler).use('*', userContext).route('/', userRoutes)
}

export function createPublicApiApp(accessTokenVerifier?: AccessTokenVerifier) {
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
    .route('/', userRoutes)
}

const app = createPublicApiApp()

// hc（型安全RPC）でフロントと共有する型
export type AppType = typeof app

export default app
