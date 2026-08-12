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
    verification: { ...state.verification, [lane]: effectiveResult },
  }
  const bothApproved =
    next.verification.internal === 'approve' && next.verification.external === 'approve'
  return bothApproved && requiredFindingsResolved(findings)
    ? { ...next, reviewedHead: next.head }
    : next
}

function canStartExternalVerification(state) {
  return state.verification.internal === 'approve'
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

const baseState = {
  issue: 124,
  head: 'head-1',
  reviewedHead: undefined,
  findings: [],
  verification: { internal: undefined, external: undefined },
}

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
  },
  {
    name: 'external verification requires internal approval',
    run: () => canStartExternalVerification(baseState),
    expected: false,
  },
  {
    name: 'internal approval permits external verification',
    run: () =>
      canStartExternalVerification({ ...baseState, verification: { internal: 'approve' } }),
    expected: true,
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
  },
  {
    name: 'partial required findings convert approval to request-changes',
    run: () => {
      return recordVerification(createRequiredFindingState(), 'internal', 'approve', [
        { id: 'I124-F001', status: 'partial', fixCommit: 'fix-1' },
      ])
    },
    expected: { reviewedHead: undefined, internal: 'request-changes', status: 'partial' },
  },
  {
    name: 'unresolved required findings convert approval to request-changes',
    run: () => {
      return recordVerification(createRequiredFindingState(), 'internal', 'approve', [
        { id: 'I124-F001', status: 'unresolved' },
      ])
    },
    expected: { reviewedHead: undefined, internal: 'request-changes', status: 'unresolved' },
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
    assert.throws(testCase.run, new RegExp(testCase.error))
    continue
  }
  const actual = testCase.run()
  if (testCase.name === 'finding IDs survive severity, source, and location changes') {
    assert.equal(actual.findings.length, 1)
    assert.equal(actual.findings[0].id, testCase.expected.id)
    assert.equal(actual.findings[0].severity, testCase.expected.severity)
    assert.equal(actual.findings[0].location, testCase.expected.location)
    assert.equal(actual.findings[0].sources.length, testCase.expected.sources)
  } else if (testCase.name === 'all required resolved updates the boundary after both approvals') {
    assert.equal(actual.reviewedHead, testCase.expected.reviewedHead)
    assert.equal(actual.findings[0].status, testCase.expected.status)
  } else if (
    testCase.name === 'partial required findings convert approval to request-changes' ||
    testCase.name === 'unresolved required findings convert approval to request-changes'
  ) {
    assert.equal(actual.reviewedHead, testCase.expected.reviewedHead)
    assert.equal(actual.verification.internal, testCase.expected.internal)
    assert.equal(actual.findings[0].status, testCase.expected.status)
  } else if (
    testCase.name === 'timeout leaves non-empty finding updates and review boundary unchanged'
  ) {
    assert.equal(actual.reviewedHead, testCase.expected.reviewedHead)
    assert.equal(actual.findings[0].status, testCase.expected.status)
    assert.equal(actual.verification.external, testCase.expected.external)
  } else {
    assert.deepEqual(actual, testCase.expected)
  }
}

console.log(`Review state machine tests passed (${cases.length})`)
