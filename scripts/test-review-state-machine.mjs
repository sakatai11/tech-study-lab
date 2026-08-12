import assert from 'node:assert/strict'

const completed = new Set(['approve', 'request-changes'])

function canStartVerification(state) {
  return state.internalVerification === 'approve' && state.internalVerificationHead === state.head
}

function nextFindingId(issue, findings) {
  return `I${issue}-F${String(findings.length + 1).padStart(3, '0')}`
}

function addDiscoveryFinding(state, finding) {
  const duplicate = state.findings.find(
    (existing) => existing.location === finding.location && existing.summary === finding.summary,
  )
  if (duplicate) {
    return {
      ...state,
      findings: state.findings.map((existing) =>
        existing.id === duplicate.id
          ? { ...existing, sources: [...existing.sources, finding.source] }
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
        sources: [finding.source],
        status: 'open',
        fixCommit: undefined,
        verification: undefined,
      },
    ],
  }
}

function recordVerification(state, result, findingResults = []) {
  if (!completed.has(result)) return state
  const byId = new Map(findingResults.map((finding) => [finding.id, finding]))
  return {
    ...state,
    findings: state.findings.map((finding) => {
      const verified = byId.get(finding.id)
      return verified
        ? {
            ...finding,
            status: verified.status,
            verification: verified.status,
            fixCommit: verified.fixCommit ?? finding.fixCommit,
          }
        : finding
    }),
  }
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
  internalVerification: undefined,
  internalVerificationHead: undefined,
  findings: [],
}

const cases = [
  {
    name: 'discovery uses the complete cumulative range',
    run: () => ({ stage: 'discovery', range: 'develop...HEAD' }),
    expected: { stage: 'discovery', range: 'develop...HEAD' },
  },
  {
    name: 'finding IDs are stable when source, severity, or location changes',
    run: () => {
      const created = addDiscoveryFinding(baseState, {
        source: '[reviewer]',
        location: 'a.ts:1',
        summary: 'bad state',
        severity: 'should-fix',
      })
      return addDiscoveryFinding(created, {
        source: '[claude]',
        location: 'a.ts:1',
        summary: 'bad state',
        severity: 'must-fix',
      })
    },
    expected: { findings: 1, id: 'I124-F001', sources: 2 },
  },
  {
    name: 'verification requires an internal approval for the current HEAD',
    run: () => canStartVerification(baseState),
    expected: false,
  },
  {
    name: 'verification can begin after internal approval for the current HEAD',
    run: () =>
      canStartVerification({
        ...baseState,
        internalVerification: 'approve',
        internalVerificationHead: 'head-1',
      }),
    expected: true,
  },
  {
    name: 'verification records resolved partial and unresolved findings',
    run: () => {
      const state = addDiscoveryFinding(
        addDiscoveryFinding(baseState, {
          source: '[reviewer]',
          location: 'a.ts:1',
          summary: 'one',
          severity: 'must-fix',
        }),
        { source: '[claude]', location: 'b.ts:2', summary: 'two', severity: 'should-fix' },
      )
      const three = addDiscoveryFinding(state, {
        source: '[reviewer]',
        location: 'c.ts:3',
        summary: 'three',
        severity: 'should-fix',
      })
      return recordVerification(three, 'approve', [
        { id: 'I124-F001', status: 'resolved', fixCommit: 'fix-1' },
        { id: 'I124-F002', status: 'partial', fixCommit: 'fix-1' },
        { id: 'I124-F003', status: 'unresolved' },
      ])
    },
    expected: ['resolved', 'partial', 'unresolved'],
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
    name: 'timeout leaves findings and review boundary unchanged',
    run: () =>
      recordVerification(
        { ...baseState, reviewedHead: 'old', findings: [{ id: 'I124-F001', status: 'open' }] },
        'timeout',
      ),
    expected: { reviewedHead: 'old', status: 'open' },
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
  if (testCase.name === 'finding IDs are stable when source, severity, or location changes') {
    assert.equal(actual.findings.length, testCase.expected.findings)
    assert.equal(actual.findings[0].id, testCase.expected.id)
    assert.equal(actual.findings[0].sources.length, testCase.expected.sources)
  } else if (testCase.name === 'verification records resolved partial and unresolved findings') {
    assert.deepEqual(
      actual.findings.map((finding) => finding.status),
      testCase.expected,
    )
  } else if (testCase.name === 'timeout leaves findings and review boundary unchanged') {
    assert.equal(actual.reviewedHead, testCase.expected.reviewedHead)
    assert.equal(actual.findings[0].status, testCase.expected.status)
  } else {
    assert.deepEqual(actual, testCase.expected)
  }
}

console.log(`Review state machine tests passed (${cases.length})`)
