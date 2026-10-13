// docs/adr/ の ADR が書式を満たし、リポジトリ中の ADR 参照が解決されることを検査する（ADR-0001、Issue #240）。
//
// ADR は「理由と境界」、テストは「不変条件の検証」を受け持つ。両者の対応が黙って切れることを防ぐ。
// 検査するのは構造と参照の解決可能性だけであり、ADR の内容の妥当性はレビューで確認する。
//
// 検査項目:
//   1. ADR ファイル（docs/adr/NNNN-<slug>.md）の見出し番号・状態・必須節、連番に欠番がないこと
//   2. 「検証」節に相対リンクが1つ以上あり、リンク先がファイルとして実在し、そのファイルが自分の ADR 番号を含むこと
//      （テストファイルは `describe` / `it` 名に付ける `[ADR-NNNN]` タグ、それ以外は `ADR-NNNN`）。
//      `Superseded by` のリンク先が実在すること
//   3. docs/adr/README.md の索引がすべての ADR を載せていること
//   4. リポジトリ中の `ADR-NNNN` と `adr/NNNN-<slug>.md` への参照が、実在する ADR を指すこと
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'

const adrDir = 'docs/adr'
const adrFilePattern = /^docs\/adr\/([0-9]{4})-[a-z0-9-]+\.md$/
const requiredSections = ['背景', '決定', '境界', '検証']
const testFilePattern = /\.test\.[cm]?[jt]sx?$/
const statusPattern =
  /^- 状態: (Proposed|Accepted|Deprecated|Superseded by \[ADR-[0-9]{4}\]\([^)]+\))\s*$/m

/** 見出し `## <name>` から次の `## ` 見出しまでの本文を返す。 */
export function sectionBody(markdown, name) {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => line.trim() === `## ${name}`)
  if (start === -1) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('## '))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

/**
 * 1件の ADR の書式違反を返す。
 *
 * `readTarget(path)` はリンク先の本文を返し、ファイルとして存在しなければ null を返す。
 */
export function validateAdr(file, number, markdown, readTarget) {
  const problems = []
  const report = (message) => problems.push({ file, message })
  const tag = `ADR-${number}`

  if (!markdown.startsWith(`# ${number}: `))
    report(`first line must be a "# ${number}: <title>" heading`)
  const superseded = markdown.match(/^- 状態: Superseded by \[ADR-[0-9]{4}\]\(([^)]+)\)/m)
  if (superseded && readTarget(normalize(join(dirname(file), superseded[1]))) === null)
    report(`superseding ADR link does not exist: ${superseded[1]}`)
  if (!statusPattern.test(markdown))
    report(
      'status line must be "- 状態: Proposed|Accepted|Deprecated|Superseded by [ADR-NNNN](...)"',
    )
  for (const name of requiredSections)
    if (sectionBody(markdown, name) === null) report(`missing "## ${name}" section`)

  const verification = sectionBody(markdown, '検証') ?? ''
  const links = [...verification.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1])
  if (links.length === 0) report('"## 検証" must link at least one test or check')

  for (const link of links) {
    if (/^[a-z]+:/i.test(link) || link.startsWith('#')) {
      report(`verification link must be a repository-relative path: ${link}`)
      continue
    }
    const target = normalize(join(dirname(file), link.split('#')[0]))
    const content = readTarget(target)
    const expected = testFilePattern.test(target) ? `[${tag}]` : tag
    if (content === null) report(`verification link does not exist: ${link}`)
    else if (!content.includes(expected))
      report(`verification target does not mention ${expected}: ${target}`)
  }

  return problems
}

/** 1ファイル分の未解決 ADR 参照を、出典行付きで返す。 */
export function findUnresolvedAdrRefs(file, text, adrs) {
  const unresolved = []

  text.split('\n').forEach((line, index) => {
    const report = (ref) => unresolved.push({ file, line: index + 1, ref })

    for (const match of line.matchAll(/\bADR-([0-9]{4})\b/g))
      if (!adrs.numbers.has(match[1])) report(match[0])
    for (const match of line.matchAll(/\badr\/([0-9]{4}-[a-z0-9-]+\.md)/g))
      if (!adrs.basenames.has(match[1])) report(match[0])
  })

  return unresolved
}

/** 検査が違反を実際に検出できることの回帰テスト。 */
function selfTest() {
  // この検査自身も走査対象に含まれるため、未解決の参照を fixture としてソース上へ literal で残さない。
  const tagOf = (number) => ['ADR', number].join('-')
  const pathOf = (basename) => ['adr', basename].join('/')
  const adrs = { numbers: new Set(['0001']), basenames: new Set(['0001-sample.md']) }

  assert.deepEqual(
    findUnresolvedAdrRefs('fixture', `${tagOf('0001')} と ${pathOf('0001-sample.md')}`, adrs),
    [],
    'existing ADR references must resolve',
  )
  assert.deepEqual(
    findUnresolvedAdrRefs('fixture', `${tagOf('0002')} と ${pathOf('0001-renamed.md')}`, adrs).map(
      (item) => item.ref,
    ),
    [tagOf('0002'), pathOf('0001-renamed.md')],
    'missing numbers and renamed files must be reported',
  )
  assert.deepEqual(
    findUnresolvedAdrRefs('fixture', `${['ADR', 'NNNN'].join('-')} は書式の説明`, adrs),
    [],
    'placeholders must not be treated as references',
  )

  const valid = [
    '# 0001: 判断',
    '',
    '- 状態: Accepted',
    '',
    '## 背景',
    '## 決定',
    '## 境界',
    '## 検証',
    '',
    '- [x.test.ts](../../src/x.test.ts): 検証内容',
  ].join('\n')
  const targets = {
    'src/x.test.ts': `describe('x [${tagOf('0001')}]')`,
    'src/y.test.ts': 'no tag',
    'src/comment.test.ts': `// ${tagOf('0001')} はコメントだけ`,
    [`docs/${pathOf('0002-next.md')}`]: '# 0002: 次の判断',
  }
  const readTarget = (path) => targets[path] ?? null
  const file = `docs/${pathOf('0001-sample.md')}`

  assert.deepEqual(validateAdr(file, '0001', valid, readTarget), [], 'a valid ADR must pass')
  assert.deepEqual(
    validateAdr(
      file,
      '0001',
      valid.replace('../../src/x.test.ts', '../../src/y.test.ts'),
      readTarget,
    ).map((item) => item.message),
    [`verification target does not mention [${tagOf('0001')}]: src/y.test.ts`],
    'a verification target without the ADR tag must be reported',
  )
  assert.deepEqual(
    validateAdr(
      file,
      '0001',
      valid.replace('../../src/x.test.ts', '../../src/comment.test.ts'),
      readTarget,
    ).map((item) => item.message),
    [`verification target does not mention [${tagOf('0001')}]: src/comment.test.ts`],
    'a test file must carry the bracketed tag, not only a comment mention',
  )
  assert.deepEqual(
    validateAdr(
      file,
      '0001',
      valid.replace('../../src/x.test.ts', '../../src/z.test.ts'),
      readTarget,
    ).map((item) => item.message),
    ['verification link does not exist: ../../src/z.test.ts'],
    'a missing verification target must be reported',
  )
  assert.deepEqual(
    validateAdr(
      file,
      '0001',
      valid.replace('- 状態: Accepted', '- 状態: Done').replace('## 境界\n', ''),
      readTarget,
    ).map((item) => item.message),
    [
      'status line must be "- 状態: Proposed|Accepted|Deprecated|Superseded by [ADR-NNNN](...)"',
      'missing "## 境界" section',
    ],
    'an unknown status and a missing section must be reported',
  )
  assert.equal(
    validateAdr(
      file,
      '0001',
      valid.replace('- 状態: Accepted', `- 状態: Superseded by [${tagOf('0002')}](./0002-next.md)`),
      readTarget,
    ).length,
    0,
    'a superseded status with a link must pass',
  )
  assert.deepEqual(
    validateAdr(
      file,
      '0001',
      valid.replace('- 状態: Accepted', `- 状態: Superseded by [${tagOf('0002')}](./0002-gone.md)`),
      readTarget,
    ).map((item) => item.message),
    ['superseding ADR link does not exist: ./0002-gone.md'],
    'a superseded status pointing at a missing file must be reported',
  )
}

selfTest()

const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  {
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter(Boolean)
  .filter((file) => existsSync(file))

const adrFiles = files
  .map((file) => ({ file, match: file.match(adrFilePattern) }))
  .filter(({ match }) => match)
  .map(({ file, match }) => ({ file, number: match[1] }))
  .sort((a, b) => a.number.localeCompare(b.number))

const adrs = {
  numbers: new Set(adrFiles.map(({ number }) => number)),
  basenames: new Set(adrFiles.map(({ file }) => file.slice(adrDir.length + 1))),
}

const problems = []
const readTarget = (path) =>
  existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8') : null

adrFiles.forEach(({ file, number }, index) => {
  const expected = String(index + 1).padStart(4, '0')
  if (number !== expected)
    problems.push({ file, message: `ADR numbers must be consecutive: expected ${expected}` })
  problems.push(...validateAdr(file, number, readFileSync(file, 'utf8'), readTarget))
})

const indexPath = `${adrDir}/README.md`
const indexText = readTarget(indexPath) ?? ''
for (const { number } of adrFiles)
  if (!indexText.includes(`ADR-${number}`))
    problems.push({ file: indexPath, message: `index does not list ADR-${number}` })

const unresolved = []
for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (text.includes('\0')) continue
  unresolved.push(...findUnresolvedAdrRefs(file, text, adrs))
}

for (const item of problems) process.stderr.write(`invalid ADR: ${item.message} (${item.file})\n`)
for (const item of unresolved)
  process.stderr.write(`unresolved ADR reference: ${item.ref} (${item.file}:${item.line})\n`)

if (problems.length > 0 || unresolved.length > 0) {
  process.stderr.write(
    `${problems.length} ADR problem(s) and ${unresolved.length} unresolved reference(s). Fix the ADR or the reference.\n`,
  )
  process.exit(1)
}

process.stdout.write(
  `ADR references resolved (${adrFiles.length} ADR(s), ${files.length} file(s) scanned).\n`,
)
