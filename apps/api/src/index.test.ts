import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppEnv } from './env'
import { apiErrorHandler, createPublicApiApp } from './index'
import type { AccessTokenVerifier } from './middleware/access-boundary'

vi.mock('cloudflare:workers', () => ({
  WorkerEntrypoint: class {},
}))

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

describe('public API entrypoint', () => {
  it('keeps health public and completes CORS preflight before Access or user context', async () => {
    const verifier = vi.fn<AccessTokenVerifier>()
    const app = createPublicApiApp(verifier)
    const bindings = { WEB_ORIGIN: 'https://web.example.com' } as AppEnv['Bindings']

    const [health, preflight] = await Promise.all([
      app.request('https://api.example.com/health', undefined, bindings),
      app.request(
        'https://api.example.com/answers',
        {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://web.example.com',
            'Access-Control-Request-Headers': 'content-type',
            'Access-Control-Request-Method': 'POST',
          },
        },
        bindings,
      ),
    ])

    expect(health.status).toBe(200)
    await expect(health.json()).resolves.toEqual({ status: 'ok' })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://web.example.com')
    expect(preflight.headers.get('access-control-allow-credentials')).toBe('true')
    expect(verifier).not.toHaveBeenCalled()
  })

  it('rejects non-loopback public user routes without a valid Access boundary', async () => {
    const verifier = vi.fn<AccessTokenVerifier>()
    const response = await createPublicApiApp(verifier).request(
      'https://api.example.com/dashboard/due-count',
      undefined,
      {
        ACCESS_AUDIENCE: 'access-audience',
        ACCESS_ISSUER: 'https://team.cloudflareaccess.com',
        WEB_ORIGIN: 'https://web.example.com',
      } as AppEnv['Bindings'],
    )

    expect(response.status).toBe(401)
    expect(verifier).not.toHaveBeenCalled()
  })
})
