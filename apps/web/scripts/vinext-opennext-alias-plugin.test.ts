import { existsSync } from 'node:fs'

import type { Plugin } from 'vite'
import { describe, expect, it } from 'vitest'

import { openNextCloudflareAlias, openNextShimPath } from '../vinext/opennext-alias-plugin'

type HookHandler<This, Arguments extends unknown[], Result> = (
  this: This,
  ...args: Arguments
) => Result

function getHookHandler<This, Arguments extends unknown[], Result>(
  hook: HookHandler<This, Arguments, Result> | { handler: HookHandler<This, Arguments, Result> },
): HookHandler<This, Arguments, Result> {
  return typeof hook === 'function' ? hook : hook.handler
}

describe('Vinext OpenNext Cloudflare alias plugin', () => {
  const plugin = openNextCloudflareAlias()

  it('applies only to RSC and SSR environments', () => {
    const applyToEnvironment = plugin.applyToEnvironment
    if (!applyToEnvironment) throw new Error('Expected applyToEnvironment hook')

    const environment = (name: string) => ({ name }) as Parameters<typeof applyToEnvironment>[0]

    expect(applyToEnvironment(environment('rsc'))).toBe(true)
    expect(applyToEnvironment(environment('ssr'))).toBe(true)
    expect(applyToEnvironment(environment('client'))).toBe(false)
  })

  it('resolves only the OpenNext shim and exports its existing path', async () => {
    const resolveIdHook = plugin.resolveId
    if (!resolveIdHook) throw new Error('Expected resolveId hook')
    const resolveId = getHookHandler(resolveIdHook)

    expect(openNextShimPath).toMatch(/vinext\/opennext-cloudflare\.ts$/)
    expect(existsSync(openNextShimPath)).toBe(true)
    expect(
      await Reflect.apply(resolveId, undefined, [
        '@opennextjs/cloudflare',
        undefined,
        { isEntry: false },
      ]),
    ).toBe(openNextShimPath)
    expect(
      await Reflect.apply(resolveId, undefined, ['react', undefined, { isEntry: false }]),
    ).toBeUndefined()
  })

  it('runs before other resolver plugins', () => {
    expect(plugin.enforce).toBe('pre')
  })
})
