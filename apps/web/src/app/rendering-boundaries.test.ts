import { readFileSync, readdirSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const sourceRoot = new URL('../', import.meta.url)

function sourceFiles(): { path: string; text: string }[] {
  return readdirSync(sourceRoot, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path))
    .map((path) => ({ path, text: readFileSync(new URL(path, sourceRoot), 'utf8') }))
}

describe('user-specific routes [ADR-0013]', () => {
  it.each(['home', 'review', 'domains', 'analytics'])(
    'renders /%s on every request instead of a shared cache',
    (route) => {
      const page = readFileSync(new URL(`${route}/page.tsx`, import.meta.url), 'utf8')

      expect(page).toMatch(/^export const dynamic = 'force-dynamic'$/m)
    },
  )

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
