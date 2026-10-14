import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { selectLatestModel } from './latest-codex-model.mjs'

const catalog = {
  models: [
    { slug: 'gpt-6.1-sol', visibility: 'list', priority: 1 },
    { slug: 'gpt-6-astra', visibility: 'list', priority: 2 },
    { slug: 'gpt-6-sol', visibility: 'list', priority: 3 },
    { slug: 'gpt-5.6-sol', visibility: 'list', priority: 5 },
    { slug: 'gpt-7-sol-preview', visibility: 'list', priority: 0 },
    { slug: 'gpt-7-sol', visibility: 'hide', priority: 0 },
  ],
}

test('selects the listed model with the highest priority in the family', () => {
  assert.equal(selectLatestModel(catalog, 'sol'), 'gpt-6.1-sol')
  assert.equal(selectLatestModel(catalog, 'astra'), 'gpt-6-astra')
})

test('ignores hidden models and slugs that only contain the family name', () => {
  assert.equal(
    selectLatestModel(
      {
        models: [
          { slug: 'gpt-7-sol', visibility: 'hide', priority: 0 },
          { slug: 'gpt-7-sol-preview', visibility: 'list', priority: 0 },
          { slug: 'gpt-6-sol', visibility: 'list', priority: 3 },
        ],
      },
      'sol',
    ),
    'gpt-6-sol',
  )
})

test('fails instead of guessing when the latest model cannot be decided', () => {
  assert.throws(() => selectLatestModel({ models: [] }, 'sol'), /no listed sol model/)
  assert.throws(
    () =>
      selectLatestModel(
        {
          models: [
            { slug: 'gpt-6.1-sol', visibility: 'list', priority: 1 },
            { slug: 'gpt-6.2-sol', visibility: 'list', priority: 1 },
          ],
        },
        'sol',
      ),
    /ambiguous latest sol model: gpt-6.1-sol, gpt-6.2-sol/,
  )
  assert.throws(() => selectLatestModel({}, 'sol'), /invalid model catalog/)
  assert.throws(() => selectLatestModel({ models: 'gpt-6-sol' }, 'sol'), /invalid model catalog/)
  assert.throws(
    () =>
      selectLatestModel(
        {
          models: [
            { slug: 'gpt-7-sol', visibility: 'list', priority: '0' },
            { slug: 'gpt-6-sol', visibility: 'list', priority: 3 },
          ],
        },
        'sol',
      ),
    /sol model without a numeric priority: gpt-7-sol/,
  )
  assert.throws(() => selectLatestModel(catalog, 'ultra'), /unknown model family/)
})

test('the CLI prints the latest model and exits non-zero when it cannot decide', () => {
  const script = fileURLToPath(new URL('./latest-codex-model.mjs', import.meta.url))
  const bin = mkdtempSync(path.join(os.tmpdir(), 'latest-codex-model-'))
  const fakeCodex = (output, status = 0) => {
    writeFileSync(
      path.join(bin, 'codex'),
      `#!/bin/sh\ncat <<'JSON'\n${output}\nJSON\nexit ${status}\n`,
    )
    chmodSync(path.join(bin, 'codex'), 0o755)
  }
  const run = (...args) =>
    spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    })

  try {
    fakeCodex(JSON.stringify(catalog))
    const ok = run('sol')
    assert.equal(ok.status, 0, ok.stderr)
    assert.equal(ok.stdout, 'gpt-6.1-sol\n')

    assert.equal(run().status, 1)

    fakeCodex(JSON.stringify({ models: [] }))
    const none = run('sol')
    assert.equal(none.status, 1)
    assert.match(none.stderr, /error: no listed sol model/)

    fakeCodex('not json')
    assert.equal(run('sol').status, 1)

    fakeCodex(JSON.stringify(catalog), 2)
    assert.equal(run('sol').status, 1)
  } finally {
    rmSync(bin, { recursive: true, force: true })
  }
})
