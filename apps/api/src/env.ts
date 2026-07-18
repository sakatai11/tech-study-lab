export type Bindings = {
  DB: D1Database
  WEB_ORIGIN: string
}

export type Variables = {
  userId: string
}

export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}
