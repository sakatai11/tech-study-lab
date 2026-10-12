import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getTarget } from './deployment-lib.mjs'
import { smokeTest } from './deployment-smoke.mjs'

const urls = {
  apiUrl: 'https://api.example.workers.dev',
  webUrl: 'https://web.example.workers.dev',
}
const env = {
  ACCESS_ISSUER: 'https://team.cloudflareaccess.com',
  CF_ACCESS_CLIENT_ID: 'test-client',
  CF_ACCESS_CLIENT_SECRET: 'test-secret',
}
const content = { smokeQuestion: 'security-xss-01-q1', smokeLesson: 'security-xss-01' }

function fixture({
  brokenCors = false,
  missingProtection = false,
  failedAuth = false,
  errorBoundary = false,
} = {}) {
  const calls = []
  const request = async (url, options = {}) => {
    calls.push({ url, ...options })
    assert.equal(options.redirect, 'manual', 'credentials must not follow redirects')
    const path = new URL(url).pathname
    if (path === '/health') return Response.json({ status: 'ok' })
    if (path === '/')
      return new Response('<html>public</html>', { headers: { 'Content-Type': 'text/html' } })
    if (options.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': brokenCors ? '*' : urls.webUrl,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    if (!options.headers?.['CF-Access-Client-Id'])
      return missingProtection
        ? Response.json({ dueCount: 1 })
        : new Response(null, {
            status: 302,
            headers: { Location: `${env.ACCESS_ISSUER}/cdn-cgi/access/login` },
          })
    if (failedAuth) return new Response(null, { status: 403 })
    if (path === '/dashboard/due-count') return Response.json({ dueCount: 1 })
    if (path === '/answers') return Response.json({ isCorrect: true, correctIndex: 0 })
    if (path === '/lesson-views') return Response.json({ recorded: true }, { status: 201 })
    return new Response(
      errorBoundary
        ? '<html><p>error: dashboard_unavailable</p></html>'
        : '<html><h1>Learning</h1></html>',
      {
        headers: { 'Content-Type': 'text/html' },
      },
    )
  }
  return { calls, request }
}

test('production smoke only reads; verification explicitly exercises writes', async () => {
  for (const environment of ['production', 'verification']) {
    const { calls, request } = fixture()
    await smokeTest(getTarget(environment), urls, content, env, request)
    const posts = calls.filter(({ method }) => method === 'POST')
    assert.equal(posts.length, environment === 'verification' ? 2 : 0)
    for (const call of calls) {
      if (!call.headers?.['CF-Access-Client-Id']) continue
      assert.equal(new URL(call.url).hostname.endsWith('.example.workers.dev'), true)
    }
  }
})

test('bad CORS, missing Access protection, rejected service auth, or a 200 error page fails the release', async () => {
  for (const options of [
    { brokenCors: true },
    { missingProtection: true },
    { failedAuth: true },
    { errorBoundary: true },
  ]) {
    const { calls, request } = fixture(options)
    await assert.rejects(smokeTest(getTarget('verification'), urls, content, env, request))
    assert.equal(
      calls.some(({ method }) => method === 'POST'),
      false,
    )
  }
})
