import { readFileSync, readdirSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const sourceRoot = new URL('../', import.meta.url)

function sourceFiles(): { path: string; text: string }[] {
  return readdirSync(sourceRoot, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path))
    .map((path) => ({ path, text: readFileSync(new URL(path, sourceRoot), 'utf8') }))
}

describe('user-specific routes [ADR-0019]', () => {
  it.each(['home', 'review', 'domains', 'analytics'])(
    'prerenders /%s as a static shell instead of rendering on every request',
    (route) => {
      const page = readFileSync(new URL(`${route}/page.tsx`, import.meta.url), 'utf8')

      expect(page).not.toMatch(/export const (?:dynamic|revalidate)\b/)
      expect(page).not.toMatch(/\basync\b|\bawait\b/)
    },
  )

  it('fetches user-specific data only from the browser, not from Server modules', () => {
    const serverFetches = sourceFiles()
      .filter(({ path }) => !path.startsWith('lib/api-server'))
      .filter(({ text }) => /createServerApiClient|lib\/api-server/.test(text))
      .map(({ path }) => path)

    expect(serverFetches).toEqual([])
  })
})

describe('user-specific data [ADR-0013]', () => {
  it('does not opt any web source into a shared data cache', () => {
    const cached = sourceFiles()
      .filter(({ text }) => /['"]use cache['"]|unstable_cache|cacheTag|revalidateTag/.test(text))
      .map(({ path }) => path)

    expect(cached).toEqual([])
  })
})

describe('mutations [ADR-0012]', () => {
  it('sends writes through the Hono API instead of Server Actions', () => {
    const serverActions = sourceFiles()
      .filter(({ text }) => /^\s*['"]use server['"]/m.test(text))
      .map(({ path }) => path)

    expect(serverActions).toEqual([])
  })
})
