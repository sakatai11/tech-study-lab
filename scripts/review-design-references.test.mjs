import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { MODEL, collectReferences, judgeReference } from './design-references.mjs'
import { reviewPlan, runReview } from './review-design-references.mjs'

const roots = []
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})
const adr = (number) => `docs/adr/${number}-example.md`
const design = 'docs/design.md'
const source = '.ai/rules/web.md'

function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function write(root, file, text) {
  mkdirSync(dirname(join(root, file)), { recursive: true })
  writeFileSync(join(root, file), text)
}

function save(root) {
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture')
  return git(root, 'rev-parse', 'HEAD')
}

function repository() {
  const root = mkdtempSync(join(tmpdir(), 'design-review-'))
  roots.push(root)
  git(root, 'init', '-q')
  git(root, 'config', 'user.name', 'Fixture')
  git(root, 'config', 'user.email', 'fixture@example.invalid')
  write(root, design, '# Design\n## 1. 方針\n境界を守る。\n## 2. 別の章\n別の規則。\n')
  write(root, adr('0001'), '# 判断\n境界を守る。\n')
  write(root, adr('0002'), '# 判断\n他の規則。\n')
  write(root, 'AGENTS.md', '境界を守る（ADR-0001）。\n')
  write(root, source, '境界を守る（design.md 1）。\n')
  write(root, '.ai/rules/api.md', '別の規則を守る（ADR-0002）。\n')
  write(root, '.ai/review-guidelines.md', '参照先の規則を守る（ADR-0001）。\n')
  write(root, '.gitignore', '.env.local\nnode_modules/\n')
  return { root, base: save(root) }
}

function reviewCli(root) {
  for (const file of [
    'review-design-references.mjs',
    'design-references.mjs',
    'markdown-headings.mjs',
  ]) {
    mkdirSync(join(root, 'scripts'), { recursive: true })
    copyFileSync(new URL(file, import.meta.url), join(root, 'scripts', file))
  }
  return (args, env = {}) =>
    spawnSync(process.execPath, [join(root, 'scripts/review-design-references.mjs'), ...args], {
      cwd: root,
      env: { ...process.env, TYPESAFE_API_KEY: '', ...env },
      encoding: 'utf8',
    })
}

function response(choice = 'supports') {
  return new Response(
    JSON.stringify({
      model: MODEL,
      answers: {
        relation: {
          type: 'choice',
          choice,
          confidence: 1,
          probabilities: Object.fromEntries(
            ['supports', 'contradicts', 'not_addressed', 'insufficient_context'].map((label) => [
              label,
              label === choice ? 1 : 0,
            ]),
          ),
        },
      },
      usage: { input_tokens: 10, output_tokens: 1 },
    }),
  )
}

test('code-only changes and deleted policy files never cause unrelated API calls', async () => {
  const { root, base } = repository()
  write(root, 'apps/web/example.ts', 'export const value = 1\n')
  save(root)
  let calls = 0
  const fetchImpl = async () => {
    calls++
    return response()
  }
  let plan = reviewPlan(root, { base })
  assert.deepEqual(plan.sources, [])
  assert.equal((await runReview(plan, { execute: true, fetchImpl })).status, 'not_applicable')
  rmSync(join(root, source))
  save(root)
  plan = reviewPlan(root, { base })
  assert.deepEqual(plan.deletedSources, [source])
  await runReview(plan, { execute: true, fetchImpl })
  assert.equal(calls, 0)
  write(root, '.ai/rules/local.md', 'No references.\n')
  save(root)
  plan = reviewPlan(root, { base })
  assert.equal(
    (await runReview(plan, { execute: true, fetchImpl })).reason,
    'no_references_in_selected_sources',
  )
  assert.equal(calls, 0)
})

test('changed policy selects an explicit allowlisted file and previews exact claim and target', async () => {
  const { root, base } = repository()
  write(root, source, '境界と追加規則を守る（design.md 1）。\n')
  save(root)
  const plan = reviewPlan(root, { base })
  assert.deepEqual(plan.sources, [{ file: source, reasons: ['source_changed'] }])
  assert.equal(plan.rows[0].source.line, 1)
  assert.match(plan.rows[0].target.text, /境界を守る/)
  const preview = await runReview(plan, {
    fetchImpl: () => assert.fail('dry-run must not send'),
  })
  assert.equal(preview.status, 'dry_run')
  assert.equal(preview.requests, 0)
  assert.equal(preview.rows[0].reason, 'dry_run')
  assert.equal(preview.planHash, plan.planHash)
})

test('target-only changes reverse-select referring sources; design selection is conservative by document', () => {
  const { root, base } = repository()
  write(root, adr('0001'), '# 判断\n境界の規則を変更する。\n')
  save(root)
  let plan = reviewPlan(root, { base })
  assert.deepEqual(
    plan.sources.map((item) => item.file),
    ['.ai/review-guidelines.md', 'AGENTS.md'],
  )
  assert.ok(plan.sources.every((item) => item.reasons.includes('referenced_document_changed')))
  write(root, design, '# Design\n## 1. 方針\n境界を守る。\n## 2. 別の章\n別の規則を変更。\n')
  save(root)
  plan = reviewPlan(root, { base })
  assert.ok(plan.sources.some((item) => item.file === source))
  assert.ok(!plan.sources.some((item) => item.file === '.ai/rules/api.md'))
})

test('target rename/deletion and unresolved references stay visible instead of disappearing', () => {
  const { root, base } = repository()
  const renamed = ['docs', 'adr', '0001-renamed.md'].join('/')
  renameSync(join(root, adr('0001')), join(root, renamed))
  save(root)
  let plan = reviewPlan(root, { base })
  assert.equal(plan.sources.length, 2)
  assert.ok(plan.rows.every((ref) => ref.target.file === renamed && ref.status === 'resolved'))
  rmSync(join(root, renamed))
  save(root)
  plan = reviewPlan(root, { base })
  assert.equal(plan.sources.length, 2)
  assert.ok(plan.rows.every((ref) => ref.status === 'local_error'))
  assert.ok(
    plan.sources.every((item) => item.reasons.includes('unresolved_reference_after_target_change')),
  )
})

for (const change of ['delete', 'rename']) {
  test(`design document ${change} preserves broken references and still processes ADRs`, async () => {
    const { root } = repository()
    write(
      root,
      source,
      [
        '境界を守る（design.md 1）。',
        `境界を守る（[設計](../../${design}#${'1-方針'})）。`,
        `[設計](../../${design})`,
        '境界を守る（ADR-0001）。',
      ].join('\n'),
    )
    const base = save(root)
    if (change === 'delete') rmSync(join(root, design))
    else renameSync(join(root, design), join(root, 'docs/overview.md'))
    write(root, 'AGENTS.md', '変更後の境界を守る（ADR-0001）。\n')
    save(root)
    const plan = reviewPlan(root, { base })
    assert.deepEqual(
      plan.sources.map((item) => item.file),
      [source, 'AGENTS.md'],
    )
    assert.equal(plan.rows.filter((row) => row.status === 'local_error').length, 3)
    assert.ok(
      plan.rows
        .filter((row) => row.status === 'local_error')
        .every((row) => row.reason === 'unresolved_reference'),
    )
    const report = await runReview(plan, {
      execute: true,
      approvedPlan: plan.planHash,
      apiKey: 'fixture',
      fetchImpl: async (_url, options) => {
        assert.equal(JSON.parse(options.body).state.target.file, adr('0001'))
        return response()
      },
    })
    assert.equal(report.status, 'incomplete')
    assert.equal(report.requests, 2)
    assert.equal(report.rows.filter((row) => row.status === 'judged').length, 2)
    const dry = reviewCli(root)(['--base', base, '--dry-run'])
    assert.equal(dry.status, 2, dry.stderr)
    const preview = JSON.parse(dry.stdout)
    assert.equal(preview.requests, 0)
    assert.equal(preview.findings.filter((row) => row.status === 'local_error').length, 3)
    assert.deepEqual(preview.sources, plan.sources)
  })
}

test('no approval or a changed preview fails closed; same hash allows only selected payloads', async () => {
  const { root, base } = repository()
  write(root, source, '変更後の境界を守る（design.md 1）。\n')
  save(root)
  const plan = reviewPlan(root, { base })
  let calls = 0
  const fetchImpl = async (url, options) => {
    calls++
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone')
    const request = JSON.parse(options.body)
    assert.deepEqual(request.state, { source: plan.rows[0].source, target: plan.rows[0].target })
    return response()
  }
  for (const [approvedPlan, reason] of [
    [undefined, 'approval_required'],
    ['wrong', 'approved_plan_mismatch'],
  ]) {
    const report = await runReview(plan, {
      execute: true,
      approvedPlan,
      apiKey: 'fixture',
      fetchImpl,
    })
    assert.equal(report.status, 'not_run')
    assert.equal(report.rows[0].reason, reason)
    assert.equal(report.requests, 0)
  }
  assert.equal(calls, 0)
  const report = await runReview(plan, {
    execute: true,
    approvedPlan: plan.planHash,
    apiKey: 'fixture',
    fetchImpl,
  })
  assert.equal(report.status, 'completed')
  assert.equal(report.findings[0].judgment, 'supports')
  assert.equal(report.advisory, true)
  assert.equal(calls, 1)
  assert.notEqual(reviewPlan(root, { base, maxRequests: 1 }).planHash, plan.planHash)
  write(root, source, '次の境界を守る（design.md 1）。\n')
  assert.throws(() => reviewPlan(root, { base }), /review_context_dirty/)
  save(root)
  const changed = reviewPlan(root, { base })
  assert.notEqual(changed.planHash, plan.planHash)
  assert.equal(
    (await runReview(changed, { execute: true, approvedPlan: plan.planHash, fetchImpl })).reason,
    'approved_plan_mismatch',
  )
  assert.equal(calls, 1)
})

test('navigation, examples, contradiction and abstentions map to provenance and manual-review reasons', async () => {
  const { root, base } = repository()
  write(
    root,
    source,
    'A を守る（design.md 1）。\nB を守る（design.md 2）。\nC を守る（ADR-0001）。\n| 案内 | ADR-0002 |\n',
  )
  save(root)
  const plan = reviewPlan(root, { base })
  const outcomes = ['contradicts', 'not_addressed', 'insufficient_context']
  const report = await runReview(plan, {
    execute: true,
    approvedPlan: plan.planHash,
    apiKey: 'fixture',
    fetchImpl: async () => response(outcomes.shift()),
  })
  assert.equal(report.requests, 3)
  assert.ok(report.findings.every((finding) => finding.needsReview))
  assert.deepEqual(
    report.findings.map((finding) => finding.source.line),
    [1, 2, 3, 4],
  )
  assert.deepEqual(
    report.findings.map((finding) => finding.judgment),
    ['contradicts', 'not_addressed', 'insufficient_context', null],
  )
  assert.equal(report.findings[3].reason, 'navigation_table_requires_confirmation')
  assert.equal(report.findings[0].target.file, design)
  assert.equal(report.findings[2].target.file, adr('0001'))
})

test('missing key, request/context budgets, HTTP failure and network failure are distinct and bounded', async () => {
  const { root, base } = repository()
  write(root, source, '境界を守る（design.md 1）。\n境界を守る（ADR-0001）。\n')
  save(root)
  const plan = reviewPlan(root, { base })
  let calls = 0
  const fetchImpl = async () => {
    calls++
    return response()
  }
  const auth = { execute: true, approvedPlan: plan.planHash }
  const missing = await runReview(plan, { ...auth, apiKey: '', fetchImpl })
  assert.equal(missing.status, 'incomplete')
  assert.ok(missing.rows.every((row) => row.reason === 'missing_api_key'))
  assert.equal(calls, 0)
  const limited = reviewPlan(root, { base, maxRequests: 1 })
  const budget = await runReview(limited, {
    execute: true,
    approvedPlan: limited.planHash,
    apiKey: 'fixture',
    fetchImpl,
  })
  assert.equal(budget.requests, 1)
  assert.equal(budget.rows[1].reason, 'request_budget_exhausted')
  for (const [fake, reason] of [
    [
      async () => {
        throw new Error('credential-must-not-leak')
      },
      'network_error',
    ],
    [
      async () => {
        throw new DOMException('credential-must-not-leak', 'TimeoutError')
      },
      'request_timeout',
    ],
    [async () => new Response('credential-must-not-leak', { status: 401 }), 'http_401'],
    [async () => new Response('credential-must-not-leak'), 'invalid_json'],
    [async () => new Response('{}'), 'invalid_response'],
    [
      async () => ({
        ok: true,
        json: async () => {
          throw new DOMException('private', 'AbortError')
        },
      }),
      'request_timeout',
    ],
    [
      async () => ({
        ok: true,
        json: async () => {
          throw new TypeError('private')
        },
      }),
      'network_error',
    ],
  ]) {
    let attempts = 0
    const report = await runReview(plan, {
      ...auth,
      apiKey: 'credential-must-not-leak',
      fetchImpl: async () => {
        attempts++
        return fake()
      },
    })
    assert.equal(report.status, 'incomplete')
    assert.equal(report.rows[0].reason, reason)
    assert.equal(report.rows[1].reason, 'stopped_after_error')
    assert.equal(attempts, 1)
    assert.equal(report.requests, 1)
    assert.ok(!JSON.stringify(report).includes('credential-must-not-leak'))
  }
  write(root, design, `# Design\n## 1. 方針\n${'a'.repeat(24000)}\n`)
  save(root)
  const large = reviewPlan(root, { base })
  const result = await runReview(large, {
    execute: true,
    approvedPlan: large.planHash,
    apiKey: 'fixture',
    fetchImpl,
  })
  assert.equal(result.rows[0].reason, 'context_budget_exceeded')
})

test('missing dependency is local, sanitized, and does not initialise network', async () => {
  const ref = { status: 'resolved', source: { text: 'claim' }, target: { text: 'evidence' } }
  const report = await judgeReference(ref, {
    apiKey: 'fixture',
    loadTransport: async () => {
      throw Object.assign(new Error('private-path'), { code: 'ERR_MODULE_NOT_FOUND' })
    },
  })
  assert.equal(report.reason, 'dependency_missing')
  assert.ok(!JSON.stringify(report).includes('private-path'))
})

test('realpath boundaries block policy and target aliases to secret or unrelated content', () => {
  for (const file of [source, design, adr('0001')]) {
    const { root, base } = repository()
    write(root, 'private.md', 'do-not-read-this\n')
    rmSync(join(root, file))
    symlinkSync(join(root, 'private.md'), join(root, file))
    save(root)
    assert.throws(() => reviewPlan(root, { base }), /source_not_allowed|target_not_allowed/)
  }
  const { root } = repository()
  write(root, '.env.local', 'do-not-read-this\n')
  rmSync(join(root, adr('0001')))
  symlinkSync(join(root, '.env.local'), join(root, adr('0001')))
  assert.throws(() => collectReferences(root, ['AGENTS.md']), /target_not_allowed/)
})

test('untracked or staged review context is refused, unrelated work is allowed, invalid inputs stay local', () => {
  const { root, base } = repository()
  write(root, source, '変更を守る（design.md 1）。\n')
  save(root)
  write(root, '.ai/rules/new.md', '追加の規則\n')
  assert.throws(() => reviewPlan(root, { base }), /review_context_dirty/)
  rmSync(join(root, '.ai/rules/new.md'))
  write(root, '.git/info/exclude', '.DS_Store\n*.swp\n')
  write(root, 'docs/adr/.DS_Store', 'Ignored metadata\n')
  write(root, '.ai/rules/.web.md.swp', 'Ignored editor metadata\n')
  assert.equal(reviewPlan(root, { base }).sources.length, 1)
  // Ignored ADRs can still affect the collector's directory lookup and must be refused.
  write(root, '.git/info/exclude', `${adr('0003')}\n`)
  write(root, adr('0003'), 'Ignored context\n')
  assert.throws(() => reviewPlan(root, { base }), /review_context_dirty/)
  rmSync(join(root, adr('0003')))
  write(root, 'unrelated.md', 'unrelated changes\n')
  assert.equal(reviewPlan(root, { base }).sources.length, 1)
  assert.throws(() => reviewPlan(root, { base, maxRequests: 101 }), /invalid_request_budget/)
  assert.throws(() => reviewPlan(root, { base: '--help' }), /invalid_revision/)
  write(root, source, 'staged change\n')
  git(root, 'add', source)
  assert.throws(() => reviewPlan(root, { base }), /review_context_dirty/)
})

test('shared CLI executes the representative runtime cases offline, without .env loading or dependencies', async () => {
  const { root, base } = repository()
  // Both Codex and Claude Code use this exact Node entrypoint via the package script.
  // This checks its executable behaviour; it does not emulate either LLM following prose.
  const cli = reviewCli(root)
  write(root, source, '境界を守り続ける（design.md 1）。\n')
  save(root)
  const run = (args, env = {}) => cli(['--base', base, ...args], env)
  let result = run(['--dry-run'])
  assert.equal(result.status, 0, result.stderr)
  const preview = JSON.parse(result.stdout)
  assert.equal(preview.requests, 0)
  result = run(['--execute'])
  assert.equal(result.status, 2)
  assert.equal(JSON.parse(result.stdout).reason, 'approval_required')
  write(root, '.env.local', 'TYPESAFE_API_KEY=must-not-be-loaded\n')
  result = run(['--execute', '--approved-plan', preview.planHash])
  assert.equal(result.status, 2)
  assert.equal(JSON.parse(result.stdout).rows[0].reason, 'missing_api_key')
  result = run(['--execute', '--approved-plan', preview.planHash], { TYPESAFE_API_KEY: 'fixture' })
  assert.equal(result.status, 2)
  assert.equal(JSON.parse(result.stdout).rows[0].reason, 'dependency_missing')
  assert.equal(JSON.parse(result.stdout).requests, 0)
  assert.ok(!result.stdout.includes('must-not-be-loaded'))
  assert.equal(result.stderr, '')
  assert.equal(
    readFileSync(join(root, '.env.local'), 'utf8'),
    'TYPESAFE_API_KEY=must-not-be-loaded\n',
  )
})

test('CLI keeps argument errors distinct from Git failures without leaking raw diagnostics', () => {
  const { root, base } = repository()
  const cli = reviewCli(root)
  const cases = [
    [[], 'base_required'],
    [['--unknown'], 'unknown_option'],
    [['--base'], 'option_value_required'],
    [['--base', base, '--base', base], 'duplicate_option'],
    [['--base', base, '--execute', '--dry-run'], 'conflicting_modes'],
    [['--base', base, '--approved-plan', 'preview'], 'execute_required'],
    [['--base', base, '--max-requests', '101'], 'invalid_request_budget'],
    [['--base', 'missing-private-revision'], 'git_failed'],
  ]
  for (const [args, reason] of cases) {
    const result = cli(args)
    assert.equal(result.status, 2, result.stderr)
    assert.equal(result.stderr, '')
    assert.deepEqual(JSON.parse(result.stdout), {
      advisory: true,
      status: 'error',
      requests: 0,
      reason,
    })
    assert.ok(!result.stdout.includes('missing-private-revision'))
  }
})
