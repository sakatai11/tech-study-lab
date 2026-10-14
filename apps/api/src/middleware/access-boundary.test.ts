import { Hono } from 'hono'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppEnv } from '../env'
import {
  type AccessTokenVerifier,
  createAccessBoundary,
  verifyAccessToken,
} from './access-boundary'

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

describe('createAccessBoundary [ADR-0008]', () => {
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

describe('verifyAccessToken [ADR-0008]', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // JWKS は issuer ごとにキャッシュされるため、テストごとに別の issuer を使う。
  async function setup(name: string) {
    const issuer = `https://${name}.cloudflareaccess.com`
    const audience = 'access-audience'
    const signing = await generateKeyPair('ES256')
    const other = await generateKeyPair('ES256')
    const jwk = { ...(await exportJWK(signing.publicKey)), kid: 'access-key', alg: 'ES256' }
    const fetched: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        fetched.push(String(input instanceof Request ? input.url : input))
        return new Response(JSON.stringify({ keys: [jwk] }), {
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    const sign = (
      claims: { issuer?: string; audience?: string },
      key: CryptoKey = signing.privateKey,
    ) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: 'access-key' })
        .setIssuer(claims.issuer ?? issuer)
        .setAudience(claims.audience ?? audience)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(key)

    return { issuer, audience, fetched, sign, otherKey: other.privateKey }
  }

  it('accepts a token signed by the issuer JWKS derived from ACCESS_ISSUER', async () => {
    const { issuer, audience, fetched, sign } = await setup('accepts')

    await expect(verifyAccessToken(await sign({}), { issuer, audience })).resolves.toBeUndefined()
    expect(fetched).toEqual([`${issuer}/cdn-cgi/access/certs`])
  })

  it('rejects a token for another audience', async () => {
    const { issuer, audience, sign } = await setup('audience')

    await expect(
      verifyAccessToken(await sign({ audience: 'other-audience' }), { issuer, audience }),
    ).rejects.toThrow()
  })

  it('rejects a token whose issuer does not exactly match ACCESS_ISSUER', async () => {
    const { issuer, audience, sign } = await setup('issuer')

    await expect(
      verifyAccessToken(await sign({ issuer: `${issuer}/` }), { issuer, audience }),
    ).rejects.toThrow()
  })

  it('rejects a token signed by a key outside the issuer JWKS', async () => {
    const { issuer, audience, sign, otherKey } = await setup('signature')

    await expect(
      verifyAccessToken(await sign({}, otherKey), { issuer, audience }),
    ).rejects.toThrow()
  })
})
