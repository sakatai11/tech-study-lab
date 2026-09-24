#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceDir = fileURLToPath(new URL('../.codex/agents/', import.meta.url))
const script = fileURLToPath(new URL('./select-codex-agent-models.mjs', import.meta.url))
const tempDir = await mkdtemp(join(tmpdir(), 'codex-agent-models-'))
const env = { ...process.env, CODEX_AGENT_CONFIG_DIR: tempDir }
const run = (...args) =>
  execFileSync(process.execPath, [script, ...args], { env, encoding: 'utf8' }).trim()

try {
  const files = (await readdir(sourceDir)).filter((name) => name.endsWith('.toml'))
  assert.equal(files.length, 7)
  for (const name of files) await copyFile(join(sourceDir, name), join(tempDir, name))

  if (run('--check') === 'Codex agents: gpt-5.6') run('--family', 'gpt-6')
  assert.equal(run('--check'), 'Codex agents: gpt-6')
  assert.equal(run('--review-model'), 'gpt-6-sol')
  assert.equal(run('--family', 'gpt-5.6'), 'Codex agents: gpt-5.6')
  assert.equal(run('--check'), 'Codex agents: gpt-5.6')
  assert.equal(run('--review-model'), 'gpt-5.6-sol')
  assert.match(
    await readFile(join(tempDir, 'issue-investigator.toml'), 'utf8'),
    /model = "gpt-5\.6-terra"/,
  )
  assert.match(await readFile(join(tempDir, 'developer.toml'), 'utf8'), /model = "gpt-5\.6-luna"/)

  const developerPath = join(tempDir, 'developer.toml')
  const legacyDeveloper = await readFile(developerPath, 'utf8')
  await writeFile(developerPath, legacyDeveloper.replace('gpt-5.6-luna', 'gpt-6-luna'))
  const mixed = spawnSync(process.execPath, [script, '--family', 'gpt-6'], { env })
  assert.notEqual(mixed.status, 0, 'mixed configurations must be rejected before writing')
  assert.match(await readFile(join(tempDir, 'issue-investigator.toml'), 'utf8'), /gpt-5\.6-terra/)
  await writeFile(developerPath, legacyDeveloper)

  assert.equal(run('--family', 'gpt-6'), 'Codex agents: gpt-6')
  assert.equal(run('--check'), 'Codex agents: gpt-6')
  assert.equal(run('--review-model'), 'gpt-6-sol')
  console.log('Codex agent model selection tests passed')
} finally {
  await rm(tempDir, { recursive: true, force: true })
}
