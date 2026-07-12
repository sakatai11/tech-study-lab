#!/usr/bin/env node
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const check = process.argv.includes('--check')
const sourcePath = resolve(root, '.ai/hooks/hooks-source.json')

const source = JSON.parse(await readFile(sourcePath, 'utf8'))
if (source.version !== 1 || !Array.isArray(source.hooks)) {
  throw new Error('.ai/hooks/hooks-source.json must contain version 1 and a hooks array.')
}

const required = ['block-deferred-markers', 'format-changed-file', 'log-skill-usage']
const actual = new Set(source.hooks.map(({ id }) => id))
for (const id of required) {
  if (!actual.has(id)) throw new Error(`hooks-source.json is missing ${id}.`)
}

const command = (path) => `./${path}`
const claudeHooks = {
  PreToolUse: [
    {
      matcher: 'Edit|Write',
      hooks: [{ type: 'command', command: command('.claude/hooks/pre-edit.sh') }],
    },
    {
      matcher: 'Skill',
      hooks: [{ type: 'command', command: command('.claude/hooks/pre-skill.sh') }],
    },
  ],
  PostToolUse: [
    {
      matcher: 'Edit|Write',
      hooks: [{ type: 'command', command: command('.claude/hooks/post-edit.sh') }],
    },
    {
      matcher: 'Skill',
      hooks: [{ type: 'command', command: command('.claude/hooks/post-skill.sh') }],
    },
  ],
}

const codexHooks = {
  hooks: {
    PreToolUse: [
      {
        matcher: 'apply_patch',
        hooks: [{ type: 'command', command: command('.codex/hooks/pre-tool-use.sh') }],
      },
    ],
    PostToolUse: [
      {
        matcher: 'apply_patch',
        hooks: [{ type: 'command', command: command('.codex/hooks/post-tool-use.sh') }],
      },
    ],
    UserPromptSubmit: [
      {
        matcher: '.*',
        hooks: [{ type: 'command', command: command('.codex/hooks/user-prompt-submit.sh') }],
      },
    ],
  },
}

const settingsPath = resolve(root, '.claude/settings.json')
const settings = JSON.parse(await readFile(settingsPath, 'utf8'))
settings.hooks = claudeHooks

const outputs = new Map([
  [settingsPath, `${JSON.stringify(settings, null, 2)}\n`],
  [resolve(root, '.codex/hooks.json'), `${JSON.stringify(codexHooks, null, 2)}\n`],
])

let stale = false
const replacements = []
for (const [path, expected] of outputs) {
  let current = ''
  try {
    current = await readFile(path, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (current !== expected) {
    stale = true
    replacements.push([path, expected])
  }
}

if (check && stale) {
  console.error('Generated hook configuration is stale. Run: pnpm sync:agents')
  process.exit(1)
}

if (!check) {
  const temporaryPaths = []
  try {
    for (const [path, expected] of replacements) {
      const temporaryPath = `${path}.tmp-${process.pid}`
      await writeFile(temporaryPath, expected)
      temporaryPaths.push([temporaryPath, path])
    }
    for (const [temporaryPath, path] of temporaryPaths) {
      await rename(temporaryPath, path)
    }
  } finally {
    await Promise.all(
      temporaryPaths.map(([temporaryPath]) => unlink(temporaryPath).catch(() => {})),
    )
  }
}
