import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ENDPOINT,
  MODEL,
  QUESTION,
  QUESTION_VERSION,
  collectReferences,
  digest,
  runReferences,
  sourceAllowed,
  summarize,
  targetAllowed,
} from './design-references.mjs'

function git(root, args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    throw new Error('git_failed')
  }
}

function commit(root, revision) {
  if (!revision || revision.startsWith('-')) throw new Error('invalid_revision')
  return git(root, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`]).trim()
}

const splitPaths = (value) => value.split('\0').filter(Boolean)

/** Diff selection is offline. Whole policy files are selected explicitly, never a glob for sending. */
export function reviewPlan(root, { base, head = 'HEAD', maxRequests = 30 }) {
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 100)
    throw new Error('invalid_request_budget')
  const baseCommit = commit(root, base)
  const headCommit = commit(root, head)
  const changedFiles = splitPaths(
    git(root, ['diff', '--no-renames', '--name-only', '-z', baseCommit, headCommit, '--']),
  ).sort()
  const changedSources = changedFiles.filter(sourceAllowed)
  const changedTargets = changedFiles.filter(targetAllowed)
  const plan = {
    schemaVersion: 1,
    mode: 'review',
    advisory: true,
    // Bind a preview to this checkout as well as its commits and exact payloads.
    repository: realpathSync(root),
    base: baseCommit,
    head: headCommit,
    endpoint: ENDPOINT,
    model: MODEL,
    questionVersion: QUESTION_VERSION,
    questionHash: digest(QUESTION),
    maxRequests,
    changedFiles,
    sources: [],
    deletedSources: [],
    rows: [],
  }
  if (changedSources.length || changedTargets.length) {
    const policyPaths = ['AGENTS.md', '.ai/review-guidelines.md', '.ai/rules']
    const contextPaths = [...policyPaths, 'docs/design.md', 'docs/adr']
    // The existing collector reads local files. Refuse a checkout that differs from
    // the reviewed head, including untracked context that could affect ADR lookup.
    const dirtyContext = [
      ...splitPaths(git(root, ['diff', '--name-only', '-z', headCommit, '--', ...contextPaths])),
      ...splitPaths(git(root, ['ls-files', '--others', '-z', '--', ...contextPaths])),
    ].filter((file) => sourceAllowed(file) || targetAllowed(file))
    if (dirtyContext.length) throw new Error('review_context_dirty')
    const existing = splitPaths(
      git(root, ['ls-tree', '-r', '--name-only', '-z', headCommit, '--', ...policyPaths]),
    )
      .filter(sourceAllowed)
      .sort()
    plan.deletedSources = changedSources.filter((file) => !existing.includes(file))
    // Reverse lookup uses the same bounded, realpath-checked collector as the
    // explicit CLI. Unresolved references are retained when a target changed:
    // deletion/rename must not disappear from the review as an empty result.
    for (const file of existing) {
      if (!changedSources.includes(file) && !changedTargets.length) continue
      const refs = collectReferences(root, [file])
      const reasons = []
      if (changedSources.includes(file)) reasons.push('source_changed')
      if (refs.some((ref) => changedTargets.includes(ref.target?.file)))
        reasons.push('referenced_document_changed')
      if (changedTargets.length && refs.some((ref) => ref.status === 'local_error'))
        reasons.push('unresolved_reference_after_target_change')
      if (!reasons.length) continue
      plan.sources.push({ file, reasons })
      plan.rows.push(...refs)
    }
  }
  return { ...plan, planHash: digest(plan) }
}

const attentionReasons = {
  contradicts: 'potential_contradiction_check_original_documents',
  not_addressed: 'potential_wrong_reference_check_original_documents',
  insufficient_context: 'more_context_required_check_original_documents',
}

/** Retain provenance, and distinguish execution problems from semantic review candidates. */
export function reviewFindings(rows) {
  return rows.map((row) => ({
    source: { file: row.source.file, line: row.source.line },
    target: row.target
      ? { file: row.target.file, line: row.target.line, section: row.target.section }
      : null,
    ref: row.ref,
    status: row.status,
    judgment: row.judgment?.choice ?? null,
    needsReview: row.status !== 'judged' || row.judgment.choice !== 'supports',
    reason:
      row.status === 'judged'
        ? (attentionReasons[row.judgment.choice] ?? 'advisory_support_only')
        : row.reason,
  }))
}

/** A hash is an integrity guard, not evidence of user consent. The agent verifies consent. */
export async function runReview(plan, { execute = false, approvedPlan, ...transport } = {}) {
  let reason
  if (!plan.sources.length) reason = 'no_affected_sources'
  else if (!plan.rows.length) reason = 'no_references_in_selected_sources'
  else if (!execute) reason = 'dry_run'
  else if (!approvedPlan) reason = 'approval_required'
  else if (approvedPlan !== plan.planHash) reason = 'approved_plan_mismatch'

  const result = reason
    ? {
        requests: 0,
        rows: plan.rows.map((ref) =>
          ref.status === 'resolved' ? { ...ref, status: 'not_run', reason } : ref,
        ),
      }
    : await runReferences(plan.rows, { maxRequests: plan.maxRequests, ...transport })
  const incomplete = result.rows.some((row) =>
    ['not_run', 'error', 'local_error'].includes(row.status),
  )
  const status = reason
    ? ['no_affected_sources', 'no_references_in_selected_sources'].includes(reason)
      ? 'not_applicable'
      : reason === 'dry_run'
        ? 'dry_run'
        : 'not_run'
    : incomplete
      ? 'incomplete'
      : 'completed'
  return {
    ...plan,
    status,
    ...(reason ? { reason } : {}),
    ...summarize(result.rows),
    ...result,
    findings: reviewFindings(result.rows),
  }
}

function options(args) {
  const config = {}
  const seen = new Set()
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (seen.has(arg)) throw new Error('duplicate_option')
    seen.add(arg)
    if (arg === '--dry-run') config.dryRun = true
    else if (arg === '--execute') config.execute = true
    else if (['--base', '--head', '--max-requests', '--approved-plan'].includes(arg)) {
      const value = args[++i]
      if (!value || value.startsWith('-')) throw new Error('option_value_required')
      if (arg === '--base') config.base = value
      if (arg === '--head') config.head = value
      if (arg === '--max-requests') config.maxRequests = Number(value)
      if (arg === '--approved-plan') config.approvedPlan = value
    } else throw new Error('unknown_option')
  }
  if (!config.base) throw new Error('base_required')
  if (config.dryRun && config.execute) throw new Error('conflicting_modes')
  if (config.approvedPlan && !config.execute) throw new Error('execute_required')
  return config
}

async function main() {
  if (process.argv.includes('--help')) {
    process.stdout.write(
      'Usage: pnpm --silent design-ref:review --base <commit> [--head HEAD] [--dry-run] [--max-requests 1..100]\n       pnpm --silent design-ref:review --base <commit> --execute --approved-plan <planHash>\nDefault is offline dry-run. Review context must match head. JSON only; advisory, never approval. No .env files are loaded.\n',
    )
    return
  }
  try {
    const config = options(process.argv.slice(2))
    const root = fileURLToPath(new URL('../', import.meta.url))
    const report = await runReview(reviewPlan(root, config), config)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (
      ['not_run', 'incomplete'].includes(report.status) ||
      report.rows.some((row) => row.status === 'local_error')
    )
      process.exitCode = 2
  } catch (error) {
    const known = [
      'review_context_dirty',
      'source_not_allowed',
      'target_not_allowed',
      'path_outside_repository',
      'invalid_request_budget',
      'base_required',
      'invalid_revision',
      'unknown_option',
      'duplicate_option',
      'conflicting_modes',
      'execute_required',
      'option_value_required',
      'git_failed',
    ]
    process.stdout.write(
      `${JSON.stringify({ advisory: true, status: 'error', requests: 0, reason: known.includes(error?.message) ? error.message : 'invalid_arguments_or_context' })}\n`,
    )
    process.exitCode = 2
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
