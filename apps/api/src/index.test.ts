import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppEnv } from './env'
import { apiErrorHandler } from './index'

describe('apiErrorHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('maps unknown exceptions to the public 500 contract without exposing their details', async () => {
    const internalError = new Error('D1 query failed: SELECT secret_value FROM credentials')
    const app = new Hono<AppEnv>().onError(apiErrorHandler).get('/unexpected', () => {
      throw internalError
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await app.request('https://api.test/unexpected')

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'INTERNAL',
        message: 'Internal Server Error',
      },
    })
  })

  it('preserves responses from intentional HTTP exceptions', async () => {
    const app = new Hono<AppEnv>().onError(apiErrorHandler).get('/forbidden', () => {
      throw new HTTPException(403, { message: 'Forbidden' })
    })

    const response = await app.request('https://api.test/forbidden')

    expect(response.status).toBe(403)
    await expect(response.text()).resolves.toBe('Forbidden')
  })
})
