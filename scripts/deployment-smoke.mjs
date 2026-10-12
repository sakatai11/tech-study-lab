import assert from 'node:assert/strict'

export function accessHeaders(env) {
  assert(
    /^[A-Za-z0-9._-]+$/.test(env.CF_ACCESS_CLIENT_ID ?? ''),
    'Access service client ID is missing',
  )
  assert(
    /^[A-Za-z0-9._-]+$/.test(env.CF_ACCESS_CLIENT_SECRET ?? ''),
    'Access service client secret is missing',
  )
  return {
    'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID,
    'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET,
  }
}

export async function checkApiHealth(apiUrl, request = fetch) {
  const response = await request(`${apiUrl}/health`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  })
  assert.equal(response.status, 200, 'API health failed')
  assert.equal((await response.json()).status, 'ok', 'API health body failed')
}

export async function checkAuthenticatedApi(apiUrl, env = process.env, request = fetch) {
  const response = await request(`${apiUrl}/dashboard/due-count`, {
    headers: accessHeaders(env),
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  })
  assert.equal(
    response.status,
    200,
    'authenticated API failed (check the Access service token and Service Auth policy)',
  )
  assert(response.headers.get('content-type')?.includes('application/json'))
  assert.equal(typeof (await response.json()).dueCount, 'number')
}

export async function smokeTest(target, urls, summary, env = process.env, request = fetch) {
  const auth = accessHeaders(env)
  const issuer = new URL(env.ACCESS_ISSUER)
  async function get(url, options = {}) {
    return request(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000), ...options })
  }
  await checkApiHealth(urls.apiUrl, request)
  const home = await get(`${urls.webUrl}/`)
  assert.equal(home.status, 200, 'public Web entry failed')
  for (const url of [`${urls.webUrl}/home`, `${urls.apiUrl}/dashboard/due-count`]) {
    const response = await get(url)
    assert(
      [302, 303, 307].includes(response.status),
      'unauthenticated request was not redirected by Access',
    )
    assert.equal(
      new URL(response.headers.get('location'), url).hostname,
      issuer.hostname,
      'unexpected authentication destination',
    )
  }
  const preflight = await get(`${urls.apiUrl}/answers`, {
    method: 'OPTIONS',
    headers: {
      Origin: urls.webUrl,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  })
  assert.equal(preflight.status, 204, 'CORS preflight failed')
  assert.equal(preflight.headers.get('access-control-allow-origin'), urls.webUrl)
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true')
  assert(preflight.headers.get('access-control-allow-methods')?.includes('POST'))
  assert(
    preflight.headers.get('access-control-allow-headers')?.toLowerCase().includes('content-type'),
  )
  await checkAuthenticatedApi(urls.apiUrl, env, request)
  for (const path of ['/home', '/review', '/domains', '/analytics']) {
    const response = await get(`${urls.webUrl}${path}`, { headers: auth })
    assert.equal(response.status, 200, `authenticated Web ${path} failed`)
    assert(response.headers.get('content-type')?.includes('text/html'))
    const html = await response.text()
    assert(
      html.includes('<html') &&
        !/Internal Server Error|Application error:|error: (?:dashboard|review|domains|analytics)_unavailable/.test(
          html,
        ),
      `Web ${path} error page`,
    )
  }
  if (target.environment === 'verification') {
    const headers = { ...auth, Origin: urls.webUrl, 'Content-Type': 'application/json' }
    const answer = await get(`${urls.apiUrl}/answers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ questionId: summary.smokeQuestion, selectedIndex: 0 }),
    })
    assert.equal(answer.status, 200, 'verification answer write failed')
    assert.equal(typeof (await answer.json()).isCorrect, 'boolean')
    const view = await get(`${urls.apiUrl}/lesson-views`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ lessonId: summary.smokeLesson }),
    })
    assert.equal(view.status, 201, 'verification lesson view write failed')
    assert.equal((await view.json()).recorded, true)
  }
}
