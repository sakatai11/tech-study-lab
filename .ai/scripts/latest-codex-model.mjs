#!/usr/bin/env node
// Codex のモデルカタログから、指定した系統（sol / astra）の最新モデルを1つ選んで出力する（Issue #247）。
//
// 別モデル CLI レビューは、起動のたびにこの出力を `codex exec -m` に明示して渡す。
// 決められない場合は非0で終了し、CLI の既定モデルへ代用しない（`.ai/runtime-compatibility.md`）。
//
// 使い方: node .ai/scripts/latest-codex-model.mjs <sol|astra>
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const families = new Set(['sol', 'astra'])

/**
 * カタログの `models` から、一覧に出る（`visibility: list`）指定系統のモデルのうち
 * `priority` が最小（最も優先）のものの slug を返す。決められなければ例外を投げる。
 */
export function selectLatestModel(catalog, family) {
  if (!families.has(family)) throw new Error(`unknown model family: ${family}`)
  if (!catalog || !Array.isArray(catalog.models)) throw new Error('invalid model catalog')

  const candidates = catalog.models.filter(
    (model) =>
      model?.visibility === 'list' &&
      typeof model.slug === 'string' &&
      model.slug.endsWith(`-${family}`) &&
      Number.isFinite(model.priority),
  )
  if (candidates.length === 0) throw new Error(`no listed ${family} model in the catalog`)

  const best = Math.min(...candidates.map((model) => model.priority))
  const latest = candidates.filter((model) => model.priority === best)
  if (latest.length > 1)
    throw new Error(
      `ambiguous latest ${family} model: ${latest.map((model) => model.slug).join(', ')}`,
    )

  return latest[0].slug
}

function main(args) {
  const [family, ...extra] = args
  if (!family || extra.length > 0) {
    process.stderr.write('Usage: node .ai/scripts/latest-codex-model.mjs <sol|astra>\n')
    process.exitCode = 1
    return
  }

  try {
    const output = execFileSync('codex', ['debug', 'models'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    process.stdout.write(`${selectLatestModel(JSON.parse(output), family)}\n`)
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
}
