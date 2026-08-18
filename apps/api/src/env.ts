export type Bindings = {
  DB: D1Database
  ANSWERS_RATE_LIMITER: RateLimit
  LESSON_VIEWS_RATE_LIMITER: RateLimit
  WEB_ORIGIN: string
  ACCESS_ISSUER?: string
  ACCESS_AUDIENCE?: string
}

export type Variables = {
  userId: string
}

export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}
