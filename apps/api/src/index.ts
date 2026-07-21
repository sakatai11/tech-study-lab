import { type ErrorHandler, Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'

import type { AppEnv } from './env'
import { userContext } from './middleware/user-context'
import { answersRoute } from './routes/answers'
import { dashboardRoute } from './routes/dashboard'
import { reviewRoute } from './routes/review'
import { QuestionNotFoundError } from './services/errors'

const app = new Hono<AppEnv>()

app.use('*', cors({ origin: (_origin, c) => c.env.WEB_ORIGIN }))
app.use('*', userContext)
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

app.onError(apiErrorHandler)

const routes = app
  .get('/health', (c) => c.json({ status: 'ok' as const }))
  .route('/answers', answersRoute)
  .route('/review', reviewRoute)
  .route('/dashboard', dashboardRoute)

// hc（型安全RPC）でフロントと共有する型
export type AppType = typeof routes

export default app
