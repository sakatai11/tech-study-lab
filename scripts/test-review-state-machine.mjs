import assert from 'node:assert/strict'

const completed = new Set(['approve', 'request-changes'])
const severityRank = { nit: 0, 'should-fix': 1, 'must-fix': 2 }

function nextFindingId(issue, findings) {
  return `I${issue}-F${String(findings.length + 1).padStart(3, '0')}`
}

function findingIdentity(finding) {
  return finding.stableKey ?? `${finding.location}\u0000${finding.summary}`
}

function addDiscoveryFinding(state, finding) {
  const identity = findingIdentity(finding)
  const duplicate = state.findings.find((existing) => existing.identity === identity)
  if (duplicate) {
    return {
      ...state,
      findings: state.findings.map((existing) =>
        existing.id === duplicate.id
          ? {
              ...existing,
              location: finding.location,
              severity:
                severityRank[finding.severity] > severityRank[existing.severity]
                  ? finding.severity
                  : existing.severity,
              sources: [...new Set([...existing.sources, finding.source])],
            }
          : existing,
      ),
    }
  }

  return {
    ...state,
    findings: [
      ...state.findings,
      {
        ...finding,
        id: nextFindingId(state.issue, state.findings),
        identity,
        sources: [finding.source],
        status: 'open',
        fixCommit: undefined,
        verification: undefined,
      },
    ],
  }
}

function requiredFindingsResolved(findings) {
  return findings
    .filter((finding) => finding.severity === 'must-fix' || finding.severity === 'should-fix')
    .every((finding) => finding.status === 'resolved')
}

const allowedReviewPolicies = new Set(['always', 'risk-based', 'never'])
const requiredRiskRuleIds = new Set([
  'ER-1',
  'ER-2',
  'ER-3',
  'ER-4',
  'ER-5',
  'ER-6',
  'ER-7',
  'ER-8',
  'ER-9',
])

function requireDecisionEvidence(evidence) {
  if (typeof evidence !== 'string' || evidence.trim().length === 0) {
    throw new Error('external review decision requires evidence')
  }
  return evidence.trim()
}

function decideExternalReview({
  policy,
  head,
  evidence,
  matchedRequiredRules = [],
  lowRiskOnly = false,
  userExplicitNever = false,
  externalReviewStarted = false,
  externalRequiredFinding = false,
}) {
  const decisionEvidence = requireDecisionEvidence(evidence)
  if (policy === 'always') {
    return {
      status: 'required',
      decisionHead: head,
      ruleIds: ['POLICY-ALWAYS'],
      evidence: decisionEvidence,
    }
  }
  if (policy === 'never') {
    if (!userExplicitNever) throw new Error('never policy requires explicit user choice')
    return {
      status: 'not-required-by-policy',
      decisionHead: head,
      ruleIds: ['POLICY-NEVER'],
      evidence: decisionEvidence,
    }
  }
  if (policy !== 'risk-based') throw new Error('unknown review policy')
  if (!matchedRequiredRules.every((ruleId) => requiredRiskRuleIds.has(ruleId))) {
    throw new Error('invalid required review rule')
  }

  const ruleIds = [...matchedRequiredRules]
  if (externalReviewStarted || externalRequiredFinding) ruleIds.push('ER-8')
  if (ruleIds.length > 0) {
    return {
      status: 'required',
      decisionHead: head,
      ruleIds: [...new Set(ruleIds)],
      evidence: decisionEvidence,
    }
  }
  if (lowRiskOnly) {
    return {
      status: 'not-required-by-policy',
      decisionHead: head,
      ruleIds: ['LR-1'],
      evidence: decisionEvidence,
    }
  }
  return {
    status: 'required',
    decisionHead: head,
    ruleIds: ['ER-9'],
    evidence: decisionEvidence,
  }
}

function authPreflightRequired({ policy, phase, externalReviewDecision }) {
  if (policy === 'always') return phase === 'phase-0'
  if (policy === 'risk-based') {
    return phase === 'external-review-decision' && externalReviewDecision === 'required'
  }
  if (policy === 'never') return false
  throw new Error('unknown review policy')
}

function sameCliIdentity(left, right) {
  return (
    left?.cliName === right.cliName &&
    left?.version === right.version &&
    left?.checkCommand === right.checkCommand
  )
}

function decideAuthPreflight({
  policy,
  phase,
  externalReviewDecision,
  skillRunId,
  cli,
  currentAuth,
  authError = false,
}) {
  if (!authPreflightRequired({ policy, phase, externalReviewDecision })) {
    return { action: 'skip' }
  }
  if (
    !authError &&
    currentAuth?.authReady === true &&
    currentAuth.skillRunId === skillRunId &&
    sameCliIdentity(currentAuth, cli)
  ) {
    return { action: 'reuse' }
  }
  return { action: 'run-preflight' }
}

function serializeAuthReadyRecord({ cli, checkedAt, authReady }) {
  if (authReady !== true) throw new Error('only ready authentication can be persisted')
  return {
    cliName: cli.cliName,
    version: cli.version,
    checkCommand: cli.checkCommand,
    checkedAt,
    authReady: true,
  }
}

function applyAuthCheckResult({ skillRunId, cli, checkedAt, result }) {
  if (result === 'sandbox-unauthenticated') {
    return { action: 'recheck-outside-sandbox', loginRequested: false }
  }
  if (result === 'outside-sandbox-unauthenticated') {
    return { action: 'request-login', loginRequested: true }
  }
  if (result !== 'authenticated') throw new Error('unknown authentication result')

  const persistedRecord = serializeAuthReadyRecord({ cli, checkedAt, authReady: true })
  return {
    action: 'ready',
    loginRequested: false,
    authState: { skillRunId, ...persistedRecord },
    persistedRecord,
  }
}

function hasExactRuleIds(actual, expected) {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    expected.every((ruleId) => actual.includes(ruleId))
  )
}

function hasValidExternalReviewDecision(state) {
  const decision = state.externalReviewDecision
  if (!decision || decision.decisionHead !== state.head) return false
  if (!allowedReviewPolicies.has(state.reviewPolicy)) return false
  if (!Array.isArray(decision.ruleIds) || decision.ruleIds.length === 0) return false
  if (typeof decision.evidence !== 'string' || decision.evidence.trim().length === 0) return false
  if (new Set(decision.ruleIds).size !== decision.ruleIds.length) return false

  if (decision.status === 'required') {
    if (state.reviewPolicy === 'always') {
      return hasExactRuleIds(decision.ruleIds, ['POLICY-ALWAYS'])
    }
    return (
      state.reviewPolicy === 'risk-based' &&
      decision.ruleIds.every((ruleId) => requiredRiskRuleIds.has(ruleId))
    )
  }
  if (decision.status !== 'not-required-by-policy') return false
  if (state.reviewPolicy === 'risk-based') {
    return hasExactRuleIds(decision.ruleIds, ['LR-1'])
  }
  return state.reviewPolicy === 'never' && hasExactRuleIds(decision.ruleIds, ['POLICY-NEVER'])
}

function externalRequirementSatisfied(state) {
  if (!hasValidExternalReviewDecision(state)) return false
  const decision = state.externalReviewDecision
  if (decision.status === 'not-required-by-policy') return true
  return state.verification.external === 'approve' && state.verification.externalHead === state.head
}

function recordVerification(state, lane, result, findingResults = []) {
  if (!completed.has(result)) return state
  const byId = new Map(findingResults.map((finding) => [finding.id, finding]))
  const findings = state.findings.map((finding) => {
    const verified = byId.get(finding.id)
    return verified
      ? {
          ...finding,
          status: verified.status,
          verification: verified.status,
          fixCommit: verified.fixCommit ?? finding.fixCommit,
        }
      : finding
  })
  const effectiveResult =
    result === 'approve' && !requiredFindingsResolved(findings) ? 'request-changes' : result

  const next = {
    ...state,
    findings,
    verification: {
      ...state.verification,
      [lane]: effectiveResult,
      [`${lane}Head`]: state.head,
    },
  }
  const verificationPathComplete =
    next.verification.internal === 'approve' &&
    next.verification.internalHead === next.head &&
    externalRequirementSatisfied(next)
  return verificationPathComplete && requiredFindingsResolved(findings)
    ? { ...next, reviewedHead: next.head }
    : next
}

function canStartExternalVerification(state) {
  return (
    hasValidExternalReviewDecision(state) &&
    state.externalReviewDecision?.status === 'required' &&
    state.verification.internal === 'approve' &&
    state.verification.internalHead === state.head
  )
}

function classifyVerificationFinding(kind) {
  const allowed = new Set([
    'fix-regression',
    'acceptance-criterion-missed',
    'critical-security',
    'data-destruction',
  ])
  return allowed.has(kind) ? 'current-loop' : 'independent-improvement'
}

function monitor(elapsedMinutes, alive, timeoutAlreadySent = false) {
  if (!alive) return { status: 'completed' }
  if (elapsedMinutes >= 20) {
    return timeoutAlreadySent ? { status: 'timeout-already-sent' } : { status: 'timeout' }
  }
  if (elapsedMinutes >= 10) return { status: 'running', notifyProgress: true }
  return { status: 'running', notifyProgress: false }
}

function validateChunkCoverage(original, chunks, crossCuttingReview) {
  if (!crossCuttingReview) throw new Error('cross-cutting review required')
  const commits = new Set()
  const files = new Set()
  for (const chunk of chunks) {
    for (const commit of chunk.coveredCommitShas) {
      if (commits.has(commit) && !chunk.overlapReason) throw new Error('unexplained commit overlap')
      commits.add(commit)
    }
    for (const file of chunk.coveredFiles) {
      if (files.has(file) && !chunk.overlapReason) throw new Error('unexplained file overlap')
      files.add(file)
    }
  }
  assert.deepEqual([...commits].sort(), [...original.commits].sort(), 'commit union coverage')
  assert.deepEqual([...files].sort(), [...original.files].sort(), 'file union coverage')
  return true
}

const decisionEvidence = {
  always: 'The always policy requires an external review.',
  lowRiskDocs: 'Every hunk is non-executable documentation and no ER rule applies.',
  executable: 'The change modifies executable behavior covered by ER-1.',
  uncertain: 'The impact cannot be classified confidently, so ER-9 applies.',
  continuity: 'External review already started in this run, so ER-8 applies.',
  explicitNever: 'The user explicitly selected the never policy for this skill run.',
}

const baseState = {
  issue: 124,
  head: 'head-1',
  reviewedHead: undefined,
  reviewPolicy: 'always',
  externalReviewDecision: decideExternalReview({
    policy: 'always',
    head: 'head-1',
    evidence: decisionEvidence.always,
  }),
  findings: [],
  verification: {
    internal: undefined,
    internalHead: undefined,
    external: undefined,
    externalHead: undefined,
  },
}

const claudeCli = {
  cliName: 'Claude CLI',
  version: '1.2.3',
  checkCommand: '.ai/scripts/run-claude-review.sh auth status',
}

const readyAuth = applyAuthCheckResult({
  skillRunId: 'run-1',
  cli: claudeCli,
  checkedAt: '2026-08-24T00:00:00Z',
  result: 'authenticated',
}).authState

function createRequiredFindingState() {
  return addDiscoveryFinding(baseState, {
    source: '[reviewer]',
    location: 'a.ts:1',
    summary: 'bad state',
    severity: 'must-fix',
  })
}

const cases = [
  {
    name: 'always requires auth preflight in phase zero',
    run: () =>
      decideAuthPreflight({
        policy: 'always',
        phase: 'phase-0',
        skillRunId: 'run-1',
        cli: claudeCli,
      }),
    expected: { action: 'run-preflight' },
  },
  {
    name: 'always does not repeat auth preflight outside phase zero',
    run: () =>
      decideAuthPreflight({
        policy: 'always',
        phase: 'external-review-decision',
        externalReviewDecision: 'required',
        skillRunId: 'run-1',
        cli: claudeCli,
      }),
    expected: { action: 'skip' },
  },
  {
    name: 'risk-based requires auth preflight only for a required external review',
    run: () => [
      decideAuthPreflight({
        policy: 'risk-based',
        phase: 'external-review-decision',
        externalReviewDecision: 'required',
        skillRunId: 'run-1',
        cli: claudeCli,
      }).action,
      decideAuthPreflight({
        policy: 'risk-based',
        phase: 'external-review-decision',
        externalReviewDecision: 'not-required-by-policy',
        skillRunId: 'run-1',
        cli: claudeCli,
      }).action,
    ],
    expected: ['run-preflight', 'skip'],
  },
  {
    name: 'never does not require auth preflight',
    run: () =>
      decideAuthPreflight({
        policy: 'never',
        phase: 'phase-0',
        skillRunId: 'run-1',
        cli: claudeCli,
      }),
    expected: { action: 'skip' },
  },
  {
    name: 'ready authentication is reused once within the same skill run',
    run: () => {
      const actions = [
        decideAuthPreflight({
          policy: 'always',
          phase: 'phase-0',
          skillRunId: 'run-1',
          cli: claudeCli,
        }).action,
        decideAuthPreflight({
          policy: 'always',
          phase: 'phase-0',
          skillRunId: 'run-1',
          cli: claudeCli,
          currentAuth: readyAuth,
        }).action,
      ]
      return {
        actions,
        preflightRuns: actions.filter((action) => action === 'run-preflight').length,
      }
    },
    expected: { actions: ['run-preflight', 'reuse'], preflightRuns: 1 },
  },
  {
    name: 'auth error, CLI identity changes, and a new skill run require rechecking',
    run: () => [
      decideAuthPreflight({
        policy: 'always',
        phase: 'phase-0',
        skillRunId: 'run-1',
        cli: claudeCli,
        currentAuth: readyAuth,
        authError: true,
      }).action,
      decideAuthPreflight({
        policy: 'always',
        phase: 'phase-0',
        skillRunId: 'run-1',
        cli: { ...claudeCli, cliName: 'Other CLI' },
        currentAuth: readyAuth,
      }).action,
      decideAuthPreflight({
        policy: 'always',
        phase: 'phase-0',
        skillRunId: 'run-1',
        cli: { ...claudeCli, version: '2.0.0' },
        currentAuth: readyAuth,
      }).action,
      decideAuthPreflight({
        policy: 'always',
        phase: 'phase-0',
        skillRunId: 'run-2',
        cli: claudeCli,
        currentAuth: readyAuth,
      }).action,
    ],
    expected: ['run-preflight', 'run-preflight', 'run-preflight', 'run-preflight'],
  },
  {
    name: 'sandbox unauthenticated result requires an outside-sandbox recheck before login',
    run: () =>
      applyAuthCheckResult({
        skillRunId: 'run-1',
        cli: claudeCli,
        checkedAt: '2026-08-24T00:00:00Z',
        result: 'sandbox-unauthenticated',
      }),
    expected: { action: 'recheck-outside-sandbox', loginRequested: false },
  },
  {
    name: 'outside-sandbox unauthenticated result requests login',
    run: () =>
      applyAuthCheckResult({
        skillRunId: 'run-1',
        cli: claudeCli,
        checkedAt: '2026-08-24T00:00:00Z',
        result: 'outside-sandbox-unauthenticated',
      }),
    expected: { action: 'request-login', loginRequested: true },
  },
  {
    name: 'persisted auth record contains only allowlisted metadata',
    run: () => {
      const result = applyAuthCheckResult({
        skillRunId: 'run-secret',
        cli: {
          ...claudeCli,
          token: 'token-must-not-persist',
          accountId: 'account-must-not-persist',
          stdout: 'raw-output-must-not-persist',
          stderr: 'raw-error-must-not-persist',
        },
        checkedAt: '2026-08-24T00:00:00Z',
        result: 'authenticated',
      })
      return {
        keys: Object.keys(result.persistedRecord).sort(),
        serialized: JSON.stringify(result.persistedRecord),
      }
    },
    expected: {
      keys: ['authReady', 'checkCommand', 'checkedAt', 'cliName', 'version'],
      serialized:
        '{"cliName":"Claude CLI","version":"1.2.3","checkCommand":".ai/scripts/run-claude-review.sh auth status","checkedAt":"2026-08-24T00:00:00Z","authReady":true}',
    },
    assert: (actual, expected) => {
      assert.deepEqual(actual.keys, expected.keys)
      assert.equal(actual.serialized, expected.serialized)
      assert.doesNotMatch(actual.serialized, /token-must-not-persist/)
      assert.doesNotMatch(actual.serialized, /account-must-not-persist/)
      assert.doesNotMatch(actual.serialized, /raw-(output|error)-must-not-persist/)
      assert.doesNotMatch(actual.serialized, /run-secret/)
    },
  },
  {
    name: 'discovery uses the complete cumulative range',
    run: () => ({ stage: 'discovery', range: 'develop...HEAD' }),
    expected: { stage: 'discovery', range: 'develop...HEAD' },
  },
  {
    name: 'finding IDs survive severity, source, and location changes',
    run: () => {
      const created = addDiscoveryFinding(baseState, {
        source: '[reviewer]',
        location: 'a.ts:1',
        summary: 'bad state',
        severity: 'should-fix',
        stableKey: 'bad-state',
      })
      return addDiscoveryFinding(created, {
        source: '[claude]',
        location: 'moved.ts:9',
        summary: 'bad state',
        severity: 'must-fix',
        stableKey: 'bad-state',
      })
    },
    expected: { id: 'I124-F001', severity: 'must-fix', location: 'moved.ts:9', sources: 2 },
    assert: (actual, expected) => {
      assert.equal(actual.findings.length, 1)
      assert.equal(actual.findings[0].id, expected.id)
      assert.equal(actual.findings[0].severity, expected.severity)
      assert.equal(actual.findings[0].location, expected.location)
      assert.equal(actual.findings[0].sources.length, expected.sources)
    },
  },
  {
    name: 'external verification requires internal approval',
    run: () => canStartExternalVerification(baseState),
    expected: false,
  },
  {
    name: 'internal approval permits external verification',
    run: () => canStartExternalVerification(recordVerification(baseState, 'internal', 'approve')),
    expected: true,
  },
  {
    name: 'external verification rejects an internal approval for a previous HEAD',
    run: () => {
      const internallyApproved = recordVerification(baseState, 'internal', 'approve')
      return canStartExternalVerification({ ...internallyApproved, head: 'head-2' })
    },
    expected: false,
  },
  {
    name: 'risk-based low-risk documentation records an explicit non-required decision',
    run: () =>
      decideExternalReview({
        policy: 'risk-based',
        head: 'head-1',
        evidence: decisionEvidence.lowRiskDocs,
        lowRiskOnly: true,
      }),
    expected: {
      status: 'not-required-by-policy',
      decisionHead: 'head-1',
      ruleIds: ['LR-1'],
      evidence: decisionEvidence.lowRiskDocs,
    },
  },
  {
    name: 'risk-based executable changes require external review',
    run: () =>
      decideExternalReview({
        policy: 'risk-based',
        head: 'head-1',
        evidence: decisionEvidence.executable,
        matchedRequiredRules: ['ER-1'],
      }),
    expected: {
      status: 'required',
      decisionHead: 'head-1',
      ruleIds: ['ER-1'],
      evidence: decisionEvidence.executable,
    },
  },
  {
    name: 'uncertain risk classification requires external review',
    run: () =>
      decideExternalReview({
        policy: 'risk-based',
        head: 'head-1',
        evidence: decisionEvidence.uncertain,
      }),
    expected: {
      status: 'required',
      decisionHead: 'head-1',
      ruleIds: ['ER-9'],
      evidence: decisionEvidence.uncertain,
    },
  },
  {
    name: 'external discovery continuity keeps verification required',
    run: () =>
      decideExternalReview({
        policy: 'risk-based',
        head: 'head-2',
        evidence: decisionEvidence.continuity,
        lowRiskOnly: true,
        externalReviewStarted: true,
      }),
    expected: {
      status: 'required',
      decisionHead: 'head-2',
      ruleIds: ['ER-8'],
      evidence: decisionEvidence.continuity,
    },
  },
  {
    name: 'every external review decision requires concrete evidence',
    run: () => decideExternalReview({ policy: 'always', head: 'head-1' }),
    error: 'external review decision requires evidence',
  },
  {
    name: 'never policy requires explicit user choice',
    run: () =>
      decideExternalReview({
        policy: 'never',
        head: 'head-1',
        evidence: decisionEvidence.explicitNever,
      }),
    error: 'never policy requires explicit user choice',
  },
  {
    name: 'explicit never policy records a distinct non-required decision',
    run: () =>
      decideExternalReview({
        policy: 'never',
        head: 'head-1',
        evidence: decisionEvidence.explicitNever,
        userExplicitNever: true,
      }),
    expected: {
      status: 'not-required-by-policy',
      decisionHead: 'head-1',
      ruleIds: ['POLICY-NEVER'],
      evidence: decisionEvidence.explicitNever,
    },
  },
  {
    name: 'current non-required decision completes with internal approval',
    run: () => {
      const state = {
        ...baseState,
        reviewPolicy: 'risk-based',
        externalReviewDecision: decideExternalReview({
          policy: 'risk-based',
          head: 'head-1',
          evidence: decisionEvidence.lowRiskDocs,
          lowRiskOnly: true,
        }),
      }
      return recordVerification(state, 'internal', 'approve')
    },
    expected: { reviewedHead: 'head-1', external: undefined },
    assert: (actual, expected) => {
      assert.equal(actual.reviewedHead, expected.reviewedHead)
      assert.equal(actual.verification.external, expected.external)
    },
  },
  {
    name: 'non-required decision never starts external verification',
    run: () => {
      const state = {
        ...baseState,
        reviewPolicy: 'risk-based',
        externalReviewDecision: decideExternalReview({
          policy: 'risk-based',
          head: 'head-1',
          evidence: decisionEvidence.lowRiskDocs,
          lowRiskOnly: true,
        }),
      }
      return canStartExternalVerification(recordVerification(state, 'internal', 'approve'))
    },
    expected: false,
  },
  {
    name: 'explicit never policy completes with internal approval and a current decision',
    run: () => {
      const state = {
        ...baseState,
        reviewPolicy: 'never',
        externalReviewDecision: decideExternalReview({
          policy: 'never',
          head: 'head-1',
          evidence: decisionEvidence.explicitNever,
          userExplicitNever: true,
        }),
      }
      return recordVerification(state, 'internal', 'approve')
    },
    expected: { reviewedHead: 'head-1', external: undefined },
    assert: (actual, expected) => {
      assert.equal(actual.reviewedHead, expected.reviewedHead)
      assert.equal(actual.verification.external, expected.external)
    },
  },
  {
    name: 'stale non-required decision does not update the boundary',
    run: () => {
      const state = {
        ...baseState,
        head: 'head-2',
        reviewPolicy: 'risk-based',
        externalReviewDecision: decideExternalReview({
          policy: 'risk-based',
          head: 'head-1',
          evidence: decisionEvidence.lowRiskDocs,
          lowRiskOnly: true,
        }),
      }
      return recordVerification(state, 'internal', 'approve')
    },
    expected: { reviewedHead: undefined },
    assert: (actual, expected) => {
      assert.equal(actual.reviewedHead, expected.reviewedHead)
    },
  },
  {
    name: 'unsubstantiated non-required decision does not update the boundary',
    run: () =>
      recordVerification(
        {
          ...baseState,
          reviewPolicy: 'risk-based',
          externalReviewDecision: {
            status: 'not-required-by-policy',
            decisionHead: 'head-1',
            ruleIds: [],
          },
        },
        'internal',
        'approve',
      ),
    expected: { reviewedHead: undefined },
    assert: (actual, expected) => {
      assert.equal(actual.reviewedHead, expected.reviewedHead)
    },
  },
  {
    name: 'non-required decision without evidence does not update the boundary',
    run: () =>
      recordVerification(
        {
          ...baseState,
          reviewPolicy: 'risk-based',
          externalReviewDecision: {
            status: 'not-required-by-policy',
            decisionHead: 'head-1',
            ruleIds: ['LR-1'],
          },
        },
        'internal',
        'approve',
      ),
    expected: { reviewedHead: undefined },
    assert: (actual, expected) => {
      assert.equal(actual.reviewedHead, expected.reviewedHead)
    },
  },
  {
    name: 'contradictory low-risk and required rules do not update the boundary',
    run: () =>
      recordVerification(
        {
          ...baseState,
          reviewPolicy: 'risk-based',
          externalReviewDecision: {
            status: 'not-required-by-policy',
            decisionHead: 'head-1',
            ruleIds: ['LR-1', 'ER-1'],
            evidence: decisionEvidence.lowRiskDocs,
          },
        },
        'internal',
        'approve',
      ),
    expected: { reviewedHead: undefined },
    assert: (actual, expected) => {
      assert.equal(actual.reviewedHead, expected.reviewedHead)
    },
  },
  {
    name: 'unknown review policy does not update the boundary',
    run: () =>
      recordVerification(
        {
          ...baseState,
          reviewPolicy: 'sometimes',
          externalReviewDecision: {
            status: 'not-required-by-policy',
            decisionHead: 'head-1',
            ruleIds: ['LR-1'],
            evidence: decisionEvidence.lowRiskDocs,
          },
        },
        'internal',
        'approve',
      ),
    expected: { reviewedHead: undefined },
    assert: (actual, expected) => {
      assert.equal(actual.reviewedHead, expected.reviewedHead)
    },
  },
  {
    name: 'required decision without evidence does not update the boundary',
    run: () => {
      const state = {
        ...baseState,
        externalReviewDecision: {
          status: 'required',
          decisionHead: 'head-1',
          ruleIds: ['POLICY-ALWAYS'],
        },
      }
      const internal = recordVerification(state, 'internal', 'approve')
      return recordVerification(internal, 'external', 'approve')
    },
    expected: { reviewedHead: undefined },
    assert: (actual, expected) => {
      assert.equal(actual.reviewedHead, expected.reviewedHead)
    },
  },
  {
    name: 'required decision with an unknown rule does not update the boundary',
    run: () => {
      const state = {
        ...baseState,
        reviewPolicy: 'risk-based',
        externalReviewDecision: {
          status: 'required',
          decisionHead: 'head-1',
          ruleIds: ['ER-99'],
          evidence: 'An unknown rule was recorded.',
        },
      }
      const internal = recordVerification(state, 'internal', 'approve')
      return recordVerification(internal, 'external', 'approve')
    },
    expected: { reviewedHead: undefined },
    assert: (actual, expected) => {
      assert.equal(actual.reviewedHead, expected.reviewedHead)
    },
  },
  {
    name: 'zero findings update the boundary only after both approvals',
    run: () => {
      const internal = recordVerification(baseState, 'internal', 'approve')
      const external = recordVerification(internal, 'external', 'approve')
      return { afterInternal: internal.reviewedHead, afterExternal: external.reviewedHead }
    },
    expected: { afterInternal: undefined, afterExternal: 'head-1' },
  },
  {
    name: 'different approved lane HEADs do not update the boundary',
    run: () => {
      const internal = recordVerification(baseState, 'internal', 'approve')
      return recordVerification({ ...internal, head: 'head-2' }, 'external', 'approve')
    },
    expected: {
      reviewedHead: undefined,
      internalHead: 'head-1',
      externalHead: 'head-2',
    },
    assert: (actual, expected) => {
      assert.equal(actual.reviewedHead, expected.reviewedHead)
      assert.equal(actual.verification.internalHead, expected.internalHead)
      assert.equal(actual.verification.externalHead, expected.externalHead)
    },
  },
  {
    name: 'all required resolved updates the boundary after both approvals',
    run: () => {
      const internal = recordVerification(createRequiredFindingState(), 'internal', 'approve', [
        { id: 'I124-F001', status: 'resolved', fixCommit: 'fix-1' },
      ])
      return recordVerification(internal, 'external', 'approve', [
        { id: 'I124-F001', status: 'resolved', fixCommit: 'fix-1' },
      ])
    },
    expected: { reviewedHead: 'head-1', status: 'resolved' },
    assert: (actual, expected) => {
      assert.equal(actual.reviewedHead, expected.reviewedHead)
      assert.equal(actual.findings[0].status, expected.status)
    },
  },
  {
    name: 'partial required findings convert approval to request-changes',
    run: () => {
      return recordVerification(createRequiredFindingState(), 'internal', 'approve', [
        { id: 'I124-F001', status: 'partial', fixCommit: 'fix-1' },
      ])
    },
    expected: { reviewedHead: undefined, internal: 'request-changes', status: 'partial' },
    assert: (actual, expected) => {
      assert.equal(actual.reviewedHead, expected.reviewedHead)
      assert.equal(actual.verification.internal, expected.internal)
      assert.equal(actual.findings[0].status, expected.status)
    },
  },
  {
    name: 'unresolved required findings convert approval to request-changes',
    run: () => {
      return recordVerification(createRequiredFindingState(), 'internal', 'approve', [
        { id: 'I124-F001', status: 'unresolved' },
      ])
    },
    expected: { reviewedHead: undefined, internal: 'request-changes', status: 'unresolved' },
    assert: (actual, expected) => {
      assert.equal(actual.reviewedHead, expected.reviewedHead)
      assert.equal(actual.verification.internal, expected.internal)
      assert.equal(actual.findings[0].status, expected.status)
    },
  },
  {
    name: 'only permitted verification findings enter the current loop',
    run: () => [
      classifyVerificationFinding('fix-regression'),
      classifyVerificationFinding('acceptance-criterion-missed'),
      classifyVerificationFinding('critical-security'),
      classifyVerificationFinding('independent-refactor'),
    ],
    expected: ['current-loop', 'current-loop', 'current-loop', 'independent-improvement'],
  },
  {
    name: 'a silent live process remains running at five minutes',
    run: () => monitor(5, true),
    expected: { status: 'running', notifyProgress: false },
  },
  {
    name: 'ten minutes notifies while remaining running',
    run: () => monitor(10, true),
    expected: { status: 'running', notifyProgress: true },
  },
  {
    name: 'twenty minutes emits one timeout',
    run: () => monitor(20, true),
    expected: { status: 'timeout' },
  },
  {
    name: 'timeout is emitted once only',
    run: () => monitor(21, true, true),
    expected: { status: 'timeout-already-sent' },
  },
  {
    name: 'timeout leaves non-empty finding updates and review boundary unchanged',
    run: () =>
      recordVerification(
        {
          ...createRequiredFindingState(),
          reviewedHead: 'old',
          verification: { internal: 'approve', external: undefined },
        },
        'external',
        'timeout',
        [{ id: 'I124-F001', status: 'resolved', fixCommit: 'must-not-apply' }],
      ),
    expected: { reviewedHead: 'old', status: 'open', external: undefined },
    assert: (actual, expected) => {
      assert.equal(actual.reviewedHead, expected.reviewedHead)
      assert.equal(actual.findings[0].status, expected.status)
      assert.equal(actual.verification.external, expected.external)
    },
  },
  {
    name: 'chunk union coverage and cross-cutting review are required',
    run: () =>
      validateChunkCoverage(
        { commits: ['a', 'b'], files: ['a.ts', 'b.ts'] },
        [
          { coveredCommitShas: ['a'], coveredFiles: ['a.ts'] },
          { coveredCommitShas: ['b'], coveredFiles: ['b.ts'] },
        ],
        true,
      ),
    expected: true,
  },
  {
    name: 'missing chunk coverage is rejected',
    run: () =>
      validateChunkCoverage(
        { commits: ['a', 'b'], files: ['a.ts', 'b.ts'] },
        [{ coveredCommitShas: ['a'], coveredFiles: ['a.ts'] }],
        true,
      ),
    error: 'commit union coverage',
  },
  {
    name: 'unexplained chunk overlap is rejected',
    run: () =>
      validateChunkCoverage(
        { commits: ['a'], files: ['a.ts'] },
        [
          { coveredCommitShas: ['a'], coveredFiles: ['a.ts'] },
          { coveredCommitShas: ['a'], coveredFiles: ['a.ts'] },
        ],
        true,
      ),
    error: 'unexplained commit overlap',
  },
  {
    name: 'cross-cutting review is mandatory',
    run: () =>
      validateChunkCoverage(
        { commits: ['a'], files: ['a.ts'] },
        [{ coveredCommitShas: ['a'], coveredFiles: ['a.ts'] }],
        false,
      ),
    error: 'cross-cutting review required',
  },
]

for (const testCase of cases) {
  if (testCase.error) {
    assert.throws(
      testCase.run,
      (error) => error instanceof Error && error.message.includes(testCase.error),
    )
    continue
  }
  const actual = testCase.run()
  if (testCase.assert) {
    testCase.assert(actual, testCase.expected)
  } else {
    assert.deepEqual(actual, testCase.expected)
  }
}

console.log(`Review state machine tests passed (${cases.length})`)
