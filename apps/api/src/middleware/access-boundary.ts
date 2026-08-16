import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { type RemoteJWKSet, createRemoteJWKSet, jwtVerify } from 'jose'

import type { AppEnv } from '../env'

export type AccessTokenVerificationConfig = {
  issuer: string
  audience: string
}

export type AccessTokenVerifier = (
  token: string,
  config: AccessTokenVerificationConfig,
) => Promise<void>

const accessJwksByIssuer = new Map<string, RemoteJWKSet>()

function getAccessJwks(issuer: string): RemoteJWKSet {
  const existing = accessJwksByIssuer.get(issuer)
  if (existing) return existing

  const jwks = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer))
  accessJwksByIssuer.set(issuer, jwks)
  return jwks
}

export const verifyAccessToken: AccessTokenVerifier = async (token, config) => {
  await jwtVerify(token, getAccessJwks(config.issuer), {
    audience: config.audience,
    issuer: config.issuer,
  })
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return (
    normalized === 'localhost' ||
    normalized === '[::1]' ||
    normalized === '::1' ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  )
}

function accessConfiguration(bindings: AppEnv['Bindings']): AccessTokenVerificationConfig | null {
  if (!bindings.ACCESS_ISSUER || !bindings.ACCESS_AUDIENCE) return null

  return {
    audience: bindings.ACCESS_AUDIENCE,
    issuer: bindings.ACCESS_ISSUER,
  }
}

function unauthorized(c: Context<AppEnv>) {
  return c.json(
    {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      },
    },
    401,
  )
}

/**
 * Public HTTP entrypoint only: validate Cloudflare Access before userContext runs.
 * Local development can bypass this boundary only when the request URL is loopback.
 */
export function createAccessBoundary(verifier: AccessTokenVerifier = verifyAccessToken) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const config = accessConfiguration(c.env)
    if (!config) {
      const accessIsUnconfigured = !c.env.ACCESS_ISSUER && !c.env.ACCESS_AUDIENCE
      if (accessIsUnconfigured && isLoopbackHostname(new URL(c.req.url).hostname)) {
        await next()
        return
      }
      return unauthorized(c)
    }

    const token = c.req.header('Cf-Access-Jwt-Assertion')
    if (!token) {
      return unauthorized(c)
    }

    try {
      await verifier(token, config)
    } catch {
      return unauthorized(c)
    }

    await next()
  })
}
