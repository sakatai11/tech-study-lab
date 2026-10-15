import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { materialSymbolNames } from './material-symbol'

const iconDirectory = fileURLToPath(
  new URL('../../../public/icons/material-symbols/', import.meta.url),
)

describe('materialSymbolNames', () => {
  it('matches the bundled official SVG files one to one', () => {
    const bundledNames = readdirSync(iconDirectory)
      .filter((file) => file.endsWith('.svg'))
      .map((file) => file.replace(/\.svg$/, ''))

    expect([...materialSymbolNames].sort()).toEqual(bundledNames.sort())
  })
})
