import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  MODEL,
  QUESTION,
  QUESTION_VERSION,
  collectReferences,
  digest,
  evaluateMetrics,
  judgeReference,
  summarize,
  validateResponse,
} from './design-references.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))

function options(args) {
  const result = { sources: [], maxRequests: 30, evaluate: false, dryRun: false }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--evaluate') result.evaluate = true
    else if (arg === '--dry-run') result.dryRun = true
    else if (arg === '--compare') result.compare = args[++i]
    else if (arg === '--human-timing') result.humanTiming = args[++i]
    else if (arg === '--max-requests') result.maxRequests = Number(args[++i])
    else if (arg.startsWith('-')) throw new Error('unknown_option')
    else result.sources.push(arg)
  }
  if (
    !Number.isSafeInteger(result.maxRequests) ||
    result.maxRequests < 1 ||
    result.maxRequests > 100
  )
    throw new Error('max_requests_must_be_1_to_100')
  if (result.evaluate && result.sources.length)
    throw new Error('evaluate_does_not_accept_source_paths')
  if (result.compare && (result.sources.length || result.evaluate || result.dryRun))
    throw new Error('compare_is_offline_only')
  if (Boolean(result.compare) !== Boolean(result.humanTiming))
    throw new Error('compare_and_human_timing_required_together')
  if (args.includes('--compare') && !result.compare) throw new Error('compare_path_required')
  if (args.includes('--human-timing') && !result.humanTiming)
    throw new Error('human_timing_path_required')
  return result
}

function evaluationCases() {
  const dataset = JSON.parse(
    readFileSync(new URL('./fixtures/design-reference-evaluation.json', import.meta.url), 'utf8'),
  )
  if (dataset.cases.length !== 24 || new Set(dataset.cases.map((row) => row.id)).size !== 24)
    throw new Error('invalid_dataset')
  for (const row of dataset.cases) {
    if (
      !Object.hasOwn(QUESTION.criteria, row.expected) ||
      !row.source?.text ||
      !row.target?.text ||
      !row.rationale
    )
      throw new Error('invalid_dataset')
  }
  return {
    hash: digest(dataset),
    rows: dataset.cases.map((row) => ({ ...row, status: 'resolved' })),
  }
}

function humanComparison(path, report) {
  const timing = JSON.parse(readFileSync(path, 'utf8'))
  if (
    timing.datasetHash !== report.datasetHash ||
    timing.resultsHash !== digest(report.rows) ||
    timing.cases !== 24 ||
    !timing.reviewer?.trim() ||
    !Number.isFinite(Date.parse(timing.measuredAt)) ||
    ![timing.baselineSeconds, timing.assistedReviewSeconds].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    throw new Error('invalid_human_timing')
  return {
    datasetHash: timing.datasetHash,
    resultsHash: timing.resultsHash,
    reviewer: timing.reviewer,
    measuredAt: timing.measuredAt,
    cases: timing.cases,
    baselineSeconds: timing.baselineSeconds,
    assistedReviewSeconds: timing.assistedReviewSeconds,
    status: 'self_reported_measurement',
    savedReviewSeconds: timing.baselineSeconds - timing.assistedReviewSeconds,
    assistedTotalSeconds: timing.assistedReviewSeconds + report.elapsedMs / 1000,
    savedTotalSeconds:
      timing.baselineSeconds - timing.assistedReviewSeconds - report.elapsedMs / 1000,
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    process.stdout.write(
      'Usage: pnpm design-ref:check [--dry-run] [--max-requests 1..100] <AGENTS.md|.ai/review-guidelines.md|.ai/rules/name.md>...\n       pnpm design-ref:check --evaluate [--dry-run]\n       pnpm design-ref:check --compare evaluation.json --human-timing timing.json\nJSON only on stdout. Results are advisory; exit 0 means execution completed, never semantic approval.\n',
    )
    return
  }
  const config = options(process.argv.slice(2))
  if (config.compare) {
    const report = JSON.parse(readFileSync(config.compare, 'utf8'))
    const dataset = evaluationCases()
    if (
      report.mode !== 'evaluation' ||
      report.dryRun ||
      report.datasetHash !== dataset.hash ||
      report.model !== MODEL ||
      report.questionHash !== digest(QUESTION) ||
      !Number.isFinite(report.elapsedMs) ||
      report.elapsedMs < 0 ||
      report.rows?.length !== 24 ||
      report.rows.some(
        (row, index) =>
          row.status !== 'judged' ||
          row.id !== dataset.rows[index].id ||
          row.expected !== dataset.rows[index].expected,
      )
    )
      throw new Error('complete_evaluation_report_required')
    if (report.resultsHash !== digest(report.rows)) throw new Error('results_hash_mismatch')
    for (const row of report.rows)
      validateResponse({
        model: row.model,
        answers: { relation: { type: 'choice', ...row.judgment } },
        usage: row.usage,
      })
    process.stdout.write(
      `${JSON.stringify({ mode: 'human_comparison', requests: 0, humanComparison: humanComparison(config.humanTiming, report) }, null, 2)}\n`,
    )
    return
  }
  const evaluation = config.evaluate ? evaluationCases() : null
  const refs = evaluation?.rows ?? collectReferences(root, config.sources)
  const started = performance.now()
  const rows = []
  let requests = 0
  let stopped = false
  for (const ref of refs) {
    if (ref.status !== 'resolved') {
      rows.push(ref)
      continue
    }
    if (config.dryRun || stopped || requests >= config.maxRequests) {
      rows.push({
        ...ref,
        status: 'not_run',
        reason: config.dryRun
          ? 'dry_run'
          : stopped
            ? 'stopped_after_error'
            : 'request_budget_exhausted',
      })
      continue
    }
    const result = await judgeReference(ref)
    if (result.inputHash) requests++
    if (result.status === 'error') stopped = true
    rows.push(result)
  }
  const elapsedMs = performance.now() - started
  const report = {
    schemaVersion: 1,
    mode: evaluation ? 'evaluation' : 'check',
    dryRun: config.dryRun,
    advisory: true,
    generatedAt: new Date().toISOString(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    model: MODEL,
    questionVersion: QUESTION_VERSION,
    questionHash: digest(QUESTION),
    ...(evaluation
      ? {
          datasetHash: evaluation.hash,
          metrics: evaluateMetrics(rows),
          resultsHash: digest(rows),
          humanComparison: {
            status: 'not_measured',
            baselineSeconds: null,
            assistedReviewSeconds: null,
          },
        }
      : {}),
    requests,
    maxRequests: config.maxRequests,
    elapsedMs,
    ...summarize(rows),
    rows,
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (
    rows.some(
      (row) =>
        row.status === 'local_error' ||
        row.status === 'error' ||
        (!config.dryRun && row.status === 'not_run'),
    )
  )
    process.exitCode = 2
}

main().catch(() => {
  // Avoid propagating paths, file contents, network headers or raw API responses.
  process.stderr.write(
    'Design reference check could not start. Check arguments, allowed source paths and evaluation/timing JSON. Use --help.\n',
  )
  process.exitCode = 2
})
