import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
  MODEL,
  collectReferences,
  digest,
  evaluateMetrics,
  judgeReference,
  validateResponse,
} from './design-references.mjs'
import { headingSections } from './markdown-headings.mjs'

const temporaryRoots = []
after(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true })
})

const adrPath = (number = '0001', name = 'example') =>
  ['docs', 'adr', `${number}-${name}.md`].join('/')
const designAnchor = (anchor) => ['docs/design.md', anchor].join('#')

function repository() {
  const root = mkdtempSync(join(tmpdir(), 'design-refs-'))
  temporaryRoots.push(root)
  mkdirSync(join(root, 'docs/adr'), { recursive: true })
  writeFileSync(
    join(root, 'docs/design.md'),
    '# Design\n## 1. 方針\n本文\n### 1.1 境界\n境界の本文\n## 2. 別の章\n別の本文\n',
  )
  writeFileSync(
    join(root, adrPath()),
    '# 0001: 判断\n\n- 状態: Accepted\n\n## 決定\n契約を固定する。\n',
  )
  return root
}

test('explicit source files resolve chapters and ADRs with exact provenance and bounded excerpts', () => {
  const root = repository()
  writeFileSync(join(root, 'AGENTS.md'), `境界を守る（design.md ${'1.1'}、ADR-0001）。\n`)
  const refs = collectReferences(root, ['AGENTS.md'])
  assert.equal(refs.length, 2)
  assert.equal(refs[0].source.line, 1)
  assert.equal(refs[0].source.text, `境界を守る（design.md ${'1.1'}、ADR-0001）。`)
  assert.equal(refs[0].target.text, '### 1.1 境界\n境界の本文')
  assert.equal(refs[1].target.file, adrPath())
  assert.equal(refs[0].status, 'resolved')
})

test('a resolvable but wrong target remains visible for semantic judgment', () => {
  const root = repository()
  writeFileSync(join(root, 'AGENTS.md'), '境界の規則は §2 に従う。\n')
  const [ref] = collectReferences(root, ['AGENTS.md'])
  assert.equal(ref.status, 'resolved')
  assert.match(ref.target.text, /別の本文/)
})

test('duplicate heading anchors, nested section boundaries and fenced examples are resolved deterministically', () => {
  const sections = headingSections(
    '# 同じ\n## 同じ\n本文\n### 1.1 子\n子の本文\n```\n## 偽の章\n```\n## 同じ\n最後\n',
  )
  assert.deepEqual(
    sections.map((section) => section.anchor),
    ['同じ', '同じ-1', '11-子', '同じ-2'],
  )
  assert.match(sections[1].text, /子の本文/)
  assert.ok(!sections[1].text.includes('最後'))
})

test('multiple chapter numbers and ADR ranges keep each target; emoji do not corrupt link masking', () => {
  const root = repository()
  writeFileSync(join(root, adrPath('0002')), '# 0002: 別の判断\n- 状態: Accepted\n')
  writeFileSync(
    join(root, 'AGENTS.md'),
    `😀 [ADR-0001](${adrPath()}) の規則と design.md 1 / 1.1、ADR-0001〜ADR-0002。\n`,
  )
  const refs = collectReferences(root, ['AGENTS.md'])
  assert.equal(refs.length, 4)
  assert.ok(refs.every((ref) => ref.status === 'resolved'))
})

test('wrong relative paths cannot resolve by basename; source symlinks cannot read outside the repository', () => {
  const root = repository()
  writeFileSync(
    join(root, 'AGENTS.md'),
    `[設計](elsewhere/${designAnchor('1-方針')}) と [ADR-0001](elsewhere/${adrPath()})。\n`,
  )
  assert.ok(collectReferences(root, ['AGENTS.md']).every((ref) => ref.status === 'local_error'))
  mkdirSync(join(root, '.ai/rules'), { recursive: true })
  symlinkSync('/etc/hostname', join(root, '.ai/rules/example.md'))
  assert.throws(() => collectReferences(root, ['.ai/rules/example.md']), /path_outside_repository/)
})

test('unresolved references stay local errors, including anchors and ADR file names', () => {
  const root = repository()
  const missing = ['9', '9'].join('')
  writeFileSync(
    join(root, 'AGENTS.md'),
    `規則は §${missing}、[章](${designAnchor('missing')})、[ADR-0001](${adrPath('0001', 'renamed')})。\n`,
  )
  const refs = collectReferences(root, ['AGENTS.md'])
  assert.equal(refs.filter((ref) => ref.status === 'local_error').length, 3)
  assert.ok(refs.every((ref) => ref.status === 'local_error'))
})

test('navigation, document-level links, and code examples require confirmation; source paths are allowlisted', () => {
  const root = repository()
  writeFileSync(
    join(root, 'AGENTS.md'),
    '[設計](docs/design.md)\n§1 を参照する。\n```md\n§1 の例\n```\n',
  )
  const refs = collectReferences(root, ['AGENTS.md'])
  assert.equal(refs.length, 3)
  assert.ok(refs.every((ref) => ref.status === 'needs_confirmation' && ref.reason))
  assert.throws(() => collectReferences(root, ['.env.local']), /source_not_allowed/)
  assert.throws(() => collectReferences(root, ['../AGENTS.md']), /source_not_allowed/)
  assert.throws(() => collectReferences(root, []), /explicit_source_required/)
})

function response(choice = 'supports') {
  return {
    model: MODEL,
    answers: {
      relation: {
        type: 'choice',
        choice,
        probabilities: Object.fromEntries(
          ['supports', 'contradicts', 'not_addressed', 'insufficient_context'].map((label) => [
            label,
            label === choice ? 1 : 0,
          ]),
        ),
        confidence: 1,
      },
    },
    usage: { input_tokens: 123, output_tokens: 12 },
  }
}

test('the API boundary rejects unknown labels, mismatched models, incomplete distributions and invalid usage', () => {
  assert.equal(validateResponse(response()).choice, 'supports')
  for (const mutate of [
    (r) => {
      r.model = 'jev-latest'
    },
    (r) => {
      r.answers.relation.choice = 'unknown'
    },
    (r) => {
      r.answers.relation.probabilities = { supports: 1, contradicts: 0, insufficient_context: 0 }
    },
    (r) => {
      r.answers.relation.probabilities.contradicts = 1
    },
    (r) => {
      r.answers.relation.confidence = Number.NaN
    },
    (r) => {
      r.usage.input_tokens = -1
    },
  ]) {
    const bad = response()
    mutate(bad)
    assert.throws(() => validateResponse(bad), /invalid_response/)
  }
})

test('missing key, timeout, HTTP failure, and malformed JSON never become judgments or leak credentials', async () => {
  const ref = { status: 'resolved', source: { text: '主張' }, target: { text: '根拠' } }
  let calls = 0
  const fake = async () => {
    calls++
    return new Response(JSON.stringify(response()))
  }
  assert.equal((await judgeReference(ref, { apiKey: '', fetchImpl: fake })).status, 'not_run')
  assert.equal(calls, 0)
  for (const fetchImpl of [
    async () => {
      throw new Error('secret-do-not-print')
    },
    async () => new Response('secret-do-not-print', { status: 401 }),
    async () => new Response('secret-do-not-print'),
    async () => new Response(JSON.stringify({})),
  ]) {
    const result = await judgeReference(ref, { apiKey: 'secret-do-not-print', fetchImpl })
    assert.equal(result.status, 'error')
    assert.equal(result.judgment, undefined)
    assert.ok(!JSON.stringify(result).includes('secret-do-not-print'))
  }
  const result = await judgeReference(ref, { apiKey: 'test', fetchImpl: fake })
  assert.equal(result.status, 'judged')
  assert.equal(result.judgment.choice, 'supports')
  assert.equal(result.usage.input_tokens, 123)
})

test('context budget is checked before a request and only the claim/evidence enters the API state', async () => {
  let calls = 0
  const fetchImpl = async (url, options) => {
    calls++
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone')
    assert.equal(options.redirect, 'error')
    const request = JSON.parse(options.body)
    assert.deepEqual(Object.keys(request.state).sort(), ['source', 'target'])
    assert.ok(!options.body.includes('expected-label-must-not-leak'))
    assert.ok(!options.body.includes('secret-do-not-print'))
    return new Response(JSON.stringify(response()))
  }
  const ref = {
    status: 'resolved',
    expected: 'expected-label-must-not-leak',
    source: { text: '主張' },
    target: { text: '根拠' },
  }
  await judgeReference(ref, { apiKey: 'secret-do-not-print', fetchImpl })
  const large = await judgeReference(
    { ...ref, target: { text: 'a'.repeat(24000) } },
    { apiKey: 'test', fetchImpl },
  )
  assert.equal(large.status, 'not_run')
  assert.equal(large.reason, 'context_budget_exceeded')
  assert.equal(calls, 1)
})

test('CLI dry run succeeds without network, missing credentials return exit 2 and invalid source paths fail before requests', () => {
  const script = new URL('./check-design-references.mjs', import.meta.url).pathname
  const env = { ...process.env, TYPESAFE_API_KEY: '' }
  const dry = spawnSync(process.execPath, [script, '--evaluate', '--dry-run'], {
    env,
    encoding: 'utf8',
  })
  assert.equal(dry.status, 0)
  assert.equal(JSON.parse(dry.stdout).requests, 0)
  const missing = spawnSync(process.execPath, [script, '--evaluate'], { env, encoding: 'utf8' })
  assert.equal(missing.status, 2)
  const report = JSON.parse(missing.stdout)
  assert.equal(report.metrics.accuracy, null)
  assert.equal(report.counts.not_run, 24)
  assert.ok(report.rows.every((row) => row.reason === 'missing_api_key' && !row.judgment))
  const invalid = spawnSync(process.execPath, [script, '.env.local'], { env, encoding: 'utf8' })
  assert.equal(invalid.status, 2)
  assert.equal(invalid.stdout, '')
})

test('human timing compares the same completed results offline and refuses mismatched or incomplete reports', () => {
  const root = repository()
  const script = new URL('./check-design-references.mjs', import.meta.url).pathname
  const env = { ...process.env, TYPESAFE_API_KEY: '' }
  const dry = spawnSync(process.execPath, [script, '--evaluate', '--dry-run'], {
    env,
    encoding: 'utf8',
  })
  const report = JSON.parse(dry.stdout)
  const reportPath = join(root, 'report.json')
  const timingPath = join(root, 'timing.json')
  report.dryRun = false
  report.elapsedMs = 2000
  report.rows = report.rows.map((row) => ({
    ...row,
    status: 'judged',
    model: MODEL,
    judgment: response(row.expected).answers.relation,
    usage: response().usage,
  }))
  report.resultsHash = digest(report.rows)
  const timing = {
    datasetHash: report.datasetHash,
    resultsHash: digest(report.rows),
    cases: 24,
    reviewer: 'test fixture, not a measured human result',
    measuredAt: '2026-10-17T00:00:00Z',
    baselineSeconds: 100,
    assistedReviewSeconds: 60,
  }
  writeFileSync(reportPath, JSON.stringify(report))
  writeFileSync(timingPath, JSON.stringify(timing))
  const run = () =>
    spawnSync(process.execPath, [script, '--compare', reportPath, '--human-timing', timingPath], {
      env,
      encoding: 'utf8',
    })
  const result = run()
  assert.equal(result.status, 0)
  assert.equal(JSON.parse(result.stdout).requests, 0)
  assert.equal(JSON.parse(result.stdout).humanComparison.savedTotalSeconds, 38)
  timing.resultsHash = 'different-results'
  writeFileSync(timingPath, JSON.stringify(timing))
  assert.equal(run().status, 2)
  report.rows[0].status = 'not_run'
  writeFileSync(reportPath, JSON.stringify(report))
  assert.equal(run().status, 2)
})

test('metrics distinguish errors and abstentions from accuracy and count unsafe supports and missed supports', () => {
  const rows = [
    { expected: 'supports', status: 'judged', judgment: { choice: 'contradicts' } },
    { expected: 'contradicts', status: 'judged', judgment: { choice: 'supports' } },
    { expected: 'not_addressed', status: 'judged', judgment: { choice: 'not_addressed' } },
    { expected: 'supports', status: 'not_run' },
  ]
  const metrics = evaluateMetrics(rows)
  assert.equal(metrics.correct, 1)
  assert.equal(metrics.judged, 3)
  assert.equal(metrics.total, 4)
  assert.equal(metrics.falseSupports, 1)
  assert.equal(metrics.missedSupports, 1)
  assert.equal(metrics.accuracy, 1 / 3)
})

test('the Japanese evaluation dataset has 24 unique pre-labelled cases across all four outcomes', () => {
  const dataset = JSON.parse(
    readFileSync(new URL('./fixtures/design-reference-evaluation.json', import.meta.url), 'utf8'),
  )
  assert.equal(dataset.cases.length, 24)
  assert.equal(new Set(dataset.cases.map((row) => row.id)).size, 24)
  for (const label of ['supports', 'contradicts', 'not_addressed', 'insufficient_context']) {
    assert.equal(dataset.cases.filter((row) => row.expected === label).length, 6)
  }
})
