import assert from 'node:assert/strict'

const completed = new Set(['approve', 'request-changes'])

function isAncestor(state, candidate, head) {
  return (
    candidate === head ||
    state.ancestorPairs.some(
      ([ancestor, descendant]) => ancestor === candidate && descendant === head,
    )
  )
}

function selectInternal(state) {
  if (!state.internalBoundary) {
    return { range: `develop...${state.head}`, stage: 'internal-initial-cumulative' }
  }
  if (!isAncestor(state, state.internalBoundary, state.head)) {
    throw new Error('invalid internal boundary')
  }
  return { range: `${state.internalBoundary}...${state.head}`, stage: 'internal-incremental' }
}

function canStartSpec(state) {
  return state.internalBoundary === state.head && state.internalResult === 'approve'
}

function selectExternal(state) {
  if (!canStartSpec(state)) {
    throw new Error('internal approval required before spec review')
  }
  if (!state.externalBoundary) {
    return {
      logicalBase: 'develop',
      range: `${state.developEffectiveBase}...${state.head}`,
      stage: 'external-initial-cumulative',
    }
  }
  if (!isAncestor(state, state.externalBoundary, state.head)) {
    throw new Error('invalid external boundary')
  }
  return {
    logicalBase: state.externalBoundary,
    range: `${state.externalBoundary}...${state.head}`,
    stage: 'external-incremental',
  }
}

function selectFallback(state) {
  if (!canStartSpec(state)) {
    throw new Error('internal approval required before spec review')
  }
  if (!state.specBoundary) {
    return { range: `develop...${state.head}`, stage: 'fallback-cumulative' }
  }
  if (!isAncestor(state, state.specBoundary, state.head)) {
    throw new Error('invalid spec boundary')
  }
  return { range: `${state.specBoundary}...${state.head}`, stage: 'fallback-incremental' }
}

function validateReviewerStage(state, brief) {
  let selected

  switch (brief.reviewStage) {
    case 'internal-initial-cumulative':
    case 'internal-incremental':
      selected = selectInternal(state)
      break
    case 'fallback-cumulative':
    case 'fallback-incremental':
      selected = selectFallback(state)
      break
    default:
      throw new Error('invalid reviewer stage')
  }

  if (selected.stage !== brief.reviewStage) {
    throw new Error('review stage does not match boundary state')
  }
  if (selected.range !== brief.committedRange) {
    throw new Error('committed range does not match review stage')
  }
  const [base] = selected.range.split('...')
  if (base === state.head) {
    throw new Error('empty review range')
  }
  return selected
}

function recordInternalResult(state, result) {
  return completed.has(result)
    ? { ...state, internalBoundary: state.head, internalResult: result }
    : state
}

function recordSpecResult(state, route, result) {
  if (!completed.has(result)) {
    return state
  }

  const next = { ...state, specBoundary: state.head, specRoute: route }
  return route === 'cross-model-cli' ? { ...next, externalBoundary: state.head } : next
}

const baseState = {
  ancestorPairs: [
    ['develop-base', 'initial-head'],
    ['develop-base', 'fixed-head'],
    ['initial-head', 'fixed-head'],
    ['external-head', 'fixed-head'],
  ],
  developEffectiveBase: 'develop-base',
  head: 'initial-head',
  internalBoundary: undefined,
  internalResult: undefined,
  externalBoundary: undefined,
  specBoundary: undefined,
  specRoute: undefined,
}

const cases = [
  {
    name: 'initial internal review is cumulative',
    run: () => selectInternal(baseState),
    expected: { range: 'develop...initial-head', stage: 'internal-initial-cumulative' },
  },
  {
    name: 'reviewer validates internal initial cumulative range',
    run: () =>
      validateReviewerStage(baseState, {
        committedRange: 'develop...initial-head',
        reviewStage: 'internal-initial-cumulative',
      }),
    expected: { range: 'develop...initial-head', stage: 'internal-initial-cumulative' },
  },
  {
    name: 'spec review is blocked before internal approval',
    run: () => selectExternal(baseState),
    error: 'internal approval required before spec review',
  },
  {
    name: 'internal boundary enables incremental review after a fix',
    run: () =>
      selectInternal({
        ...baseState,
        head: 'fixed-head',
        internalBoundary: 'initial-head',
      }),
    expected: { range: 'initial-head...fixed-head', stage: 'internal-incremental' },
  },
  {
    name: 'reviewer validates internal incremental range',
    run: () =>
      validateReviewerStage(
        { ...baseState, head: 'fixed-head', internalBoundary: 'initial-head' },
        {
          committedRange: 'initial-head...fixed-head',
          reviewStage: 'internal-incremental',
        },
      ),
    expected: { range: 'initial-head...fixed-head', stage: 'internal-incremental' },
  },
  {
    name: 'non-ancestor internal boundary is rejected',
    run: () => selectInternal({ ...baseState, internalBoundary: 'unrelated-head' }),
    error: 'invalid internal boundary',
  },
  {
    name: 'fallback boundary cannot make external review incremental',
    run: () =>
      selectExternal({
        ...baseState,
        internalBoundary: 'initial-head',
        internalResult: 'approve',
        specBoundary: 'initial-head',
        specRoute: 'fallback-internal',
      }),
    expected: {
      logicalBase: 'develop',
      range: 'develop-base...initial-head',
      stage: 'external-initial-cumulative',
    },
  },
  {
    name: 'external approve records an external boundary',
    run: () => recordSpecResult({ ...baseState }, 'cross-model-cli', 'approve'),
    expected: {
      externalBoundary: 'initial-head',
      specBoundary: 'initial-head',
      specRoute: 'cross-model-cli',
    },
  },
  {
    name: 'external request changes records an external boundary',
    run: () => recordSpecResult({ ...baseState }, 'cross-model-cli', 'request-changes'),
    expected: {
      externalBoundary: 'initial-head',
      specBoundary: 'initial-head',
      specRoute: 'cross-model-cli',
    },
  },
  {
    name: 'fallback result does not record an external boundary',
    run: () => recordSpecResult({ ...baseState }, 'fallback-internal', 'approve'),
    expected: {
      externalBoundary: undefined,
      specBoundary: 'initial-head',
      specRoute: 'fallback-internal',
    },
  },
  {
    name: 'fallback is cumulative without a spec boundary even with an external boundary',
    run: () =>
      selectFallback({
        ...baseState,
        externalBoundary: 'initial-head',
        internalBoundary: 'initial-head',
        internalResult: 'approve',
      }),
    expected: { range: 'develop...initial-head', stage: 'fallback-cumulative' },
  },
  {
    name: 'reviewer validates fallback cumulative range without spec boundary',
    run: () =>
      validateReviewerStage(
        {
          ...baseState,
          externalBoundary: 'initial-head',
          internalBoundary: 'initial-head',
          internalResult: 'approve',
        },
        {
          committedRange: 'develop...initial-head',
          reviewStage: 'fallback-cumulative',
        },
      ),
    expected: { range: 'develop...initial-head', stage: 'fallback-cumulative' },
  },
  {
    name: 'fallback is incremental from its spec boundary regardless of route or external boundary',
    run: () =>
      selectFallback({
        ...baseState,
        externalBoundary: 'external-head',
        head: 'fixed-head',
        internalBoundary: 'fixed-head',
        internalResult: 'approve',
        specBoundary: 'initial-head',
        specRoute: 'fallback-internal',
      }),
    expected: { range: 'initial-head...fixed-head', stage: 'fallback-incremental' },
  },
  {
    name: 'reviewer validates fallback incremental range from spec boundary',
    run: () =>
      validateReviewerStage(
        {
          ...baseState,
          externalBoundary: 'external-head',
          head: 'fixed-head',
          internalBoundary: 'fixed-head',
          internalResult: 'approve',
          specBoundary: 'initial-head',
          specRoute: 'fallback-internal',
        },
        {
          committedRange: 'initial-head...fixed-head',
          reviewStage: 'fallback-incremental',
        },
      ),
    expected: { range: 'initial-head...fixed-head', stage: 'fallback-incremental' },
  },
  {
    name: 'reviewer rejects fallback incremental range mismatch',
    run: () =>
      validateReviewerStage(
        {
          ...baseState,
          head: 'fixed-head',
          internalBoundary: 'fixed-head',
          internalResult: 'approve',
          specBoundary: 'initial-head',
        },
        { committedRange: 'develop...fixed-head', reviewStage: 'fallback-incremental' },
      ),
    error: 'committed range does not match review stage',
  },
  {
    name: 'reviewer rejects empty fallback incremental range',
    run: () =>
      validateReviewerStage(
        {
          ...baseState,
          internalBoundary: 'initial-head',
          internalResult: 'approve',
          specBoundary: 'initial-head',
        },
        {
          committedRange: 'initial-head...initial-head',
          reviewStage: 'fallback-incremental',
        },
      ),
    error: 'empty review range',
  },
  {
    name: 'non-ancestor spec boundary is rejected for fallback',
    run: () =>
      selectFallback({
        ...baseState,
        internalBoundary: 'initial-head',
        internalResult: 'approve',
        specBoundary: 'unrelated-head',
      }),
    error: 'invalid spec boundary',
  },
  {
    name: 'timeout does not update review boundaries',
    run: () => recordSpecResult({ ...baseState }, 'cross-model-cli', 'timeout'),
    expected: { externalBoundary: undefined, specBoundary: undefined, specRoute: undefined },
  },
  {
    name: 'error does not update review boundaries',
    run: () => recordSpecResult({ ...baseState }, 'cross-model-cli', 'error'),
    expected: { externalBoundary: undefined, specBoundary: undefined, specRoute: undefined },
  },
  {
    name: 'auth required does not update review boundaries',
    run: () => recordSpecResult({ ...baseState }, 'cross-model-cli', 'auth-required'),
    expected: { externalBoundary: undefined, specBoundary: undefined, specRoute: undefined },
  },
  {
    name: 'non-ancestor external boundary is rejected',
    run: () =>
      selectExternal({
        ...baseState,
        externalBoundary: 'unrelated-head',
        internalBoundary: 'initial-head',
        internalResult: 'approve',
      }),
    error: 'invalid external boundary',
  },
  {
    name: 'external boundary enables incremental review after a fix',
    run: () =>
      selectExternal({
        ...baseState,
        externalBoundary: 'external-head',
        head: 'fixed-head',
        internalBoundary: 'fixed-head',
        internalResult: 'approve',
      }),
    expected: {
      logicalBase: 'external-head',
      range: 'external-head...fixed-head',
      stage: 'external-incremental',
    },
  },
  {
    name: 'initial implementation remains in external cumulative coverage',
    run: () => {
      const reviewed = recordInternalResult(baseState, 'approve')
      return selectExternal(reviewed)
    },
    expected: {
      logicalBase: 'develop',
      range: 'develop-base...initial-head',
      stage: 'external-initial-cumulative',
    },
  },
  {
    name: 'internal fixes remain in initial external cumulative coverage',
    run: () =>
      selectExternal({
        ...baseState,
        head: 'fixed-head',
        internalBoundary: 'fixed-head',
        internalResult: 'approve',
      }),
    expected: {
      logicalBase: 'develop',
      range: 'develop-base...fixed-head',
      stage: 'external-initial-cumulative',
    },
  },
]

for (const testCase of cases) {
  if (testCase.error) {
    assert.throws(testCase.run, new RegExp(testCase.error))
  } else {
    const actual = testCase.run()
    for (const [key, value] of Object.entries(testCase.expected)) {
      assert.equal(actual[key], value, `${testCase.name}: ${key}`)
    }
  }
}

console.log(`Review state machine tests passed (${cases.length})`)
