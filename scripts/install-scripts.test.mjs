import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const root = join(import.meta.dirname, '..')
const read = (path) => readFileSync(join(root, path), 'utf8')

test('pnpm runs dependency build scripts only for the explicit allowlist [ADR-0022]', () => {
  const pnpm = JSON.parse(read('package.json')).pnpm ?? {}
  assert.deepEqual(pnpm.onlyBuiltDependencies, ['esbuild', 'workerd'])
  assert.equal(pnpm.neverBuiltDependencies, undefined)
  assert.doesNotMatch(read('.npmrc'), /^\s*(ignore-scripts|dangerously-allow-all-builds)\s*=/m)
})

test('architecture/viewer npm installs skip dependency scripts locally and in CI [ADR-0022]', () => {
  assert.match(read('architecture/viewer/.npmrc'), /^ignore-scripts=true$/m)

  const workflows = join(root, '.github/workflows')
  const installs = readdirSync(workflows)
    .filter((name) => /\.ya?ml$/.test(name))
    .flatMap((name) =>
      readFileSync(join(workflows, name), 'utf8')
        .split('\n')
        .filter((line) => /\bnpm\b.*\barchitecture\/viewer\b.*\b(ci|install|i)\b/.test(line)),
    )
  assert.ok(installs.length > 0, 'CI should install the viewer dependencies')
  for (const line of installs) assert.equal(ignoreScripts(line), true, line)
})

test('ignoreScripts reads the effective npm flag value [ADR-0022]', () => {
  assert.equal(ignoreScripts('npm ci --ignore-scripts'), true)
  assert.equal(ignoreScripts('npm ci --ignore-scripts=true'), true)
  assert.equal(ignoreScripts('npm ci'), undefined)
  assert.equal(ignoreScripts('npm ci --ignore-scripts=false'), false)
  assert.equal(ignoreScripts('npm ci --ignore-scripts false'), false)
  assert.equal(ignoreScripts('npm ci --ignore-scripts --no-ignore-scripts'), false)
  assert.equal(ignoreScripts('npm ci "--ignore-scripts"'), true)
  assert.equal(ignoreScripts('npm ci --ignore-scripts "false"'), false)
  assert.equal(ignoreScripts("npm ci '--ignore-scripts=false'"), false)
})

// npm はブール値の設定を後勝ちで読み、直後の true / false も値として受け取る。
// シェルが外す引用符は、npm に渡る引数に揃えるため取り除く。
function ignoreScripts(line) {
  const args = line
    .trim()
    .split(/\s+/)
    .map((arg) => arg.replace(/^(['"])(.*)\1$/, '$2'))
  let value
  for (const [i, arg] of args.entries()) {
    if (arg === '--no-ignore-scripts') value = false
    else if (arg === '--ignore-scripts') value = args[i + 1] !== 'false'
    else if (arg.startsWith('--ignore-scripts='))
      value = arg.slice('--ignore-scripts='.length) === 'true'
  }
  return value
}
