#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const agentsDir = resolve(
  process.env.CODEX_AGENT_CONFIG_DIR ??
    fileURLToPath(new URL('../.codex/agents/', import.meta.url)),
)

const roles = {
  developer: { effort: 'xhigh', current: 'gpt-6-luna', legacy: 'gpt-5.6-luna' },
  'test-fixer': { effort: 'high', current: 'gpt-6-luna', legacy: 'gpt-5.6-luna' },
  'issue-investigator': { effort: 'medium', current: 'gpt-6-sol', legacy: 'gpt-5.6-terra' },
  reviewer: { effort: 'high', current: 'gpt-6-sol', legacy: 'gpt-5.6-terra' },
  'content-author': { effort: 'medium', current: 'gpt-6-sol', legacy: 'gpt-5.6-terra' },
  'codex-review-normalizer': { effort: 'high', current: 'gpt-6-luna', legacy: 'gpt-5.6-luna' },
  'claude-review-normalizer': { effort: 'high', current: 'gpt-6-luna', legacy: 'gpt-5.6-luna' },
}

const [command, family, ...extra] = process.argv.slice(2)
if (extra.length || !['--check', '--review-model', '--family'].includes(command)) {
  throw new Error(
    'Usage: node scripts/select-codex-agent-models.mjs --check | --review-model | --family gpt-6|gpt-5.6',
  )
}
if (command === '--family' ? !['gpt-6', 'gpt-5.6'].includes(family) : family !== undefined) {
  throw new Error('Use --family gpt-6 or --family gpt-5.6')
}

const files = await Promise.all(
  Object.entries(roles).map(async ([name, role]) => {
    const path = resolve(agentsDir, `${name}.toml`)
    const content = await readFile(path, 'utf8')
    const models = [...content.matchAll(/^model = "([^"]+)"$/gm)]
    const efforts = [...content.matchAll(/^model_reasoning_effort = "([^"]+)"$/gm)]
    if (models.length !== 1 || efforts.length !== 1 || efforts[0][1] !== role.effort) {
      throw new Error(`${name}: expected one model and reasoning effort ${role.effort}`)
    }
    const activeFamily =
      models[0][1] === role.current ? 'gpt-6' : models[0][1] === role.legacy ? 'gpt-5.6' : null
    if (!activeFamily)
      throw new Error(`${name}: unknown model; restore the standard setting before switching`)
    return { path, content, role, activeFamily }
  }),
)

const activeFamily = files[0].activeFamily
if (files.some((file) => file.activeFamily !== activeFamily)) {
  throw new Error(
    'Agent models use mixed families; restore a consistent configuration before switching',
  )
}

if (command === '--review-model') {
  console.log(activeFamily === 'gpt-6' ? 'gpt-6-sol' : 'gpt-5.6-sol')
} else if (command === '--family') {
  if (activeFamily !== family) {
    for (const file of files) {
      const previous = file.role[activeFamily === 'gpt-6' ? 'current' : 'legacy']
      const next = file.role[family === 'gpt-6' ? 'current' : 'legacy']
      await writeFile(file.path, file.content.replace(`model = "${previous}"`, `model = "${next}"`))
    }
  }
  console.log(`Codex agents: ${family}`)
} else {
  console.log(`Codex agents: ${activeFamily}`)
}
