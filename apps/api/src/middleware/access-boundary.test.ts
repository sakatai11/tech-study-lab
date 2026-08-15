import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import type { AppEnv } from '../env'
import { type AccessTokenVerifier, createAccessBoundary } from './access-boundary'

const configuredBindings = {
  ACCESS_AUDIENCE: 'access-audience',
  ACCESS_ISSUER: 'https://team.cloudflareaccess.com',
  WEB_ORIGIN: 'https://web.example.com',
} as AppEnv['Bindings']

function createApp(verifier: AccessTokenVerifier) {
  return new Hono<AppEnv>()
    .use('*', createAccessBoundary(verifier))
    .get('/private', (c) => c.json({ userContextReached: true }))
}

describe('createAccessBoundary', () => {
  it('allows a non-loopback request only after the injected verifier accepts its Access JWT', async () => {
    const verifier = vi.fn<AccessTokenVerifier>().mockResolvedValue(undefined)
    const response = await createApp(verifier).request(
      'https://api.example.com/private',
      { headers: { 'Cf-Access-Jwt-Assertion': 'valid-token' } },
      configuredBindings,
    )

    expect(response.status).toBe(200)
    expect(verifier).toHaveBeenCalledWith('valid-token', {
      audience: 'access-audience',
      issuer: 'https://team.cloudflareaccess.com',
    })
  })

  it('returns the fixed unauthorized contract without invoking the verifier when the token is absent', async () => {
    const verifier = vi.fn<AccessTokenVerifier>()
    const response = await createApp(verifier).request(
      'https://api.example.com/private',
      undefined,
      configuredBindings,
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
    })
    expect(verifier).not.toHaveBeenCalled()
  })

  it('maps verifier failures to the fixed unauthorized contract without exposing JWT details', async () => {
    const verifier = vi
      .fn<AccessTokenVerifier>()
      .mockRejectedValue(new Error('JWT signature invalid for key id private-key-id'))
    const response = await createApp(verifier).request(
      'https://api.example.com/private',
      { headers: { 'Cf-Access-Jwt-Assertion': 'invalid-token' } },
      configuredBindings,
    )

    expect(response.status).toBe(401)
    await expect(response.text()).resolves.not.toContain('private-key-id')
  })

  it('fails closed for a non-loopback request without Access configuration', async () => {
    const verifier = vi.fn<AccessTokenVerifier>()
    const response = await createApp(verifier).request(
      'https://api.example.com/private',
      { headers: { 'Cf-Access-Jwt-Assertion': 'token' } },
      { WEB_ORIGIN: 'https://web.example.com' } as AppEnv['Bindings'],
    )

    expect(response.status).toBe(401)
    expect(verifier).not.toHaveBeenCalled()
  })

  it.each([
    'http://localhost:8787/private',
    'http://127.0.0.1:8787/private',
    'http://[::1]:8787/private',
  ])('bypasses Access only for loopback URL %s', async (url) => {
    const verifier = vi.fn<AccessTokenVerifier>()
    const response = await createApp(verifier).request(url, undefined, {
      WEB_ORIGIN: 'http://localhost:3000',
    } as AppEnv['Bindings'])

    expect(response.status).toBe(200)
    expect(verifier).not.toHaveBeenCalled()
  })

  it('requires an Access JWT for a loopback URL when Access configuration exists', async () => {
    const verifier = vi.fn<AccessTokenVerifier>()
    const response = await createApp(verifier).request(
      'http://localhost:8787/private',
      undefined,
      configuredBindings,
    )

    expect(response.status).toBe(401)
    expect(verifier).not.toHaveBeenCalled()
  })

  it.each([
    { ACCESS_ISSUER: 'https://team.cloudflareaccess.com' },
    { ACCESS_AUDIENCE: 'access-audience' },
  ])(
    'fails closed for a loopback URL with incomplete Access configuration',
    async (accessBinding) => {
      const verifier = vi.fn<AccessTokenVerifier>()
      const response = await createApp(verifier).request(
        'http://localhost:8787/private',
        undefined,
        {
          ...accessBinding,
          WEB_ORIGIN: 'http://localhost:3000',
        } as AppEnv['Bindings'],
      )

      expect(response.status).toBe(401)
      expect(verifier).not.toHaveBeenCalled()
    },
  )
})
