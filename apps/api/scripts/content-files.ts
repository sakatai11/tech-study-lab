import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { ContentSourceFile } from '../src/content-sync'

export function collectContentFiles(
  contentRoot: string,
  directory = contentRoot,
): ContentSourceFile[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const entryPath = join(directory, entry.name)

      if (entry.isDirectory()) {
        return collectContentFiles(contentRoot, entryPath)
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        return []
      }

      return [
        {
          relativePath: relative(contentRoot, entryPath).split(sep).join('/'),
          source: readFileSync(entryPath, 'utf8'),
        },
      ]
    })
}
