import assert from 'node:assert/strict'
import test from 'node:test'

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
  assert.throws(() => selectLatestModel(catalog, 'ultra'), /unknown model family/)
})
