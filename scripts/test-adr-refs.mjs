// docs/adr/ の ADR が書式を満たし、リポジトリ中の ADR 参照が解決されることを検査する（ADR-0001、Issue #240）。
//
// ADR は「理由と境界」、テストは「不変条件の検証」を受け持つ。両者の対応が黙って切れることを防ぐ。
// 検査するのは構造と参照の解決可能性だけであり、ADR の内容の妥当性はレビューで確認する。
//
// 検査項目:
//   1. docs/adr/ の Markdown（README.md・template.md を除く）がすべて NNNN-<slug>.md の名前を持つこと。
//      各 ADR の見出し番号・状態・必須節、連番に欠番がないこと
//   2. 「検証」節に相対リンクが1つ以上あり、リンク先がファイルとして実在すること。
//      テストファイルは `describe` / `it` / `test` の名前に `[ADR-NNNN]` タグを持ち、それ以外は `ADR-NNNN` を含むこと
//   3. `Superseded by [ADR-NNNN](...)` の表示番号とリンク先のファイルの番号が一致し、リンク先が実在すること
//   4. docs/adr/README.md の「索引」の表に、各 ADR へのリンクの行があり、状態が ADR と一致すること
//   5. リポジトリ中の `ADR-NNNN` と `adr/NNNN-<slug>.md` への参照が、実在する ADR を指すこと
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, normalize } from 'node:path'

const adrDir = 'docs/adr'
const adrFilePattern = /^docs\/adr\/([0-9]{4})-[a-z0-9-]+\.md$/
const adrSupportFiles = new Set([`${adrDir}/README.md`, `${adrDir}/template.md`])
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

/** 状態行の値から状態の種類（Proposed / Accepted / Deprecated / Superseded）を返す。 */
function statusKind(status) {
  return status?.match(/^(Proposed|Accepted|Deprecated|Superseded)\b/)?.[1] ?? null
}

/**
 * テストファイルの `describe` / `it` / `test` に渡した名前（第1引数の文字列リテラル）を集める。
 *
 * コメントは除いてから探すため、コメントアウトした宣言やコメント中のタグは名前として数えない。
 * `it.each(...)('名前', ...)` のように表を受け取る形も、表の後に続く名前を拾う。
 */
export function testNames(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const pattern =
    /\b(?:describe|it|test)(?:\.(?:only|skip|concurrent|sequential|todo|fails))*(?:\.each\s*\([\s\S]*?\)\s*)?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
  return [...code.matchAll(pattern)].map((match) => match[2])
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
  if (!statusPattern.test(markdown))
    report(
      'status line must be "- 状態: Proposed|Accepted|Deprecated|Superseded by [ADR-NNNN](...)"',
    )
  const superseded = markdown.match(/^- 状態: Superseded by \[ADR-([0-9]{4})\]\(([^)]+)\)/m)
  if (superseded) {
    const [, shown, link] = superseded
    const linked = basename(link.split('#')[0]).match(/^([0-9]{4})-/)?.[1]
    if (linked !== shown) report(`superseding ADR link must point at the ${shown} file: ${link}`)
    else if (readTarget(normalize(join(dirname(file), link.split('#')[0]))) === null)
      report(`superseding ADR link does not exist: ${link}`)
  }
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
    if (content === null) report(`verification link does not exist: ${link}`)
    else if (testFilePattern.test(target)) {
      if (!testNames(content).some((name) => name.includes(`[${tag}]`)))
        report(`verification test has no describe / it name tagged [${tag}]: ${target}`)
    } else if (!content.includes(tag))
      report(`verification target does not mention ${tag}: ${target}`)
  }

  return problems
}

/**
 * 索引の表に、各 ADR へのリンクの行があり、状態が ADR の状態と一致するかを検査する。
 *
 * `adrs` は `{ number, basename, status }` の配列。説明文中の言及は行として数えない。
 */
export function findIndexProblems(indexText, adrs) {
  const section = sectionBody(indexText, '索引')
  if (section === null) return ['missing "## 索引" section']

  const rows = section
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim()),
    )

  const problems = []
  for (const { number, basename: name, status } of adrs) {
    const row = rows.find((cells) => cells[0] === `[ADR-${number}](./${name})`)
    if (!row) problems.push(`index has no row linking ADR-${number} to ./${name}`)
    else if (statusKind(row.at(-1)) !== statusKind(status))
      problems.push(`index status of ADR-${number} must be ${statusKind(status)}`)
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
  const pathOf = (name) => ['adr', name].join('/')
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

  const tagged = `[${tagOf('0001')}]`
  assert.deepEqual(
    testNames(
      [
        `describe('suite ${tagged}', () => {`,
        '  it.each([{ a: 1 }, { a: 2 }])(',
        `    'case $a ${tagged}',`,
        '    () => {},',
        '  )',
        `  // it('commented ${tagged}', () => {})`,
        `  /* test('blocked ${tagged}') */`,
        `  test(\`template ${tagged}\`, () => {})`,
        '})',
      ].join('\n'),
    ),
    [`suite ${tagged}`, `case $a ${tagged}`, `template ${tagged}`],
    'test names come from describe / it / test calls, including it.each, and never from comments',
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
    'src/x.test.ts': `describe('x ${tagged}', () => {})`,
    'src/y.test.ts': "describe('x', () => {})",
    'src/comment.test.ts': `// ${tagged} はコメントだけ\ndescribe('x', () => {})`,
    'scripts/check.mjs': `// ${tagOf('0001')} を検査する`,
    [`docs/${pathOf('0002-next.md')}`]: '# 0002: 次の判断',
    [`docs/${pathOf('0003-other.md')}`]: '# 0003: 別の判断',
  }
  const readTarget = (path) => targets[path] ?? null
  const file = `docs/${pathOf('0001-sample.md')}`
  const messagesOf = (markdown) =>
    validateAdr(file, '0001', markdown, readTarget).map((item) => item.message)

  assert.deepEqual(messagesOf(valid), [], 'a valid ADR must pass')
  assert.deepEqual(
    messagesOf(valid.replace('../../src/x.test.ts', '../../scripts/check.mjs')),
    [],
    'a non-test verification target only needs to mention the ADR number',
  )
  assert.deepEqual(
    messagesOf(valid.replace('../../src/x.test.ts', '../../src/y.test.ts')),
    [`verification test has no describe / it name tagged ${tagged}: src/y.test.ts`],
    'a verification test without a tagged name must be reported',
  )
  assert.deepEqual(
    messagesOf(valid.replace('../../src/x.test.ts', '../../src/comment.test.ts')),
    [`verification test has no describe / it name tagged ${tagged}: src/comment.test.ts`],
    'a bracketed tag only in a comment must not count as a tagged test name',
  )
  assert.deepEqual(
    messagesOf(valid.replace('../../src/x.test.ts', '../../src/z.test.ts')),
    ['verification link does not exist: ../../src/z.test.ts'],
    'a missing verification target must be reported',
  )
  assert.deepEqual(
    messagesOf(valid.replace('- 状態: Accepted', '- 状態: Done').replace('## 境界\n', '')),
    [
      'status line must be "- 状態: Proposed|Accepted|Deprecated|Superseded by [ADR-NNNN](...)"',
      'missing "## 境界" section',
    ],
    'an unknown status and a missing section must be reported',
  )
  const supersededBy = (number, link) =>
    valid.replace('- 状態: Accepted', `- 状態: Superseded by [${tagOf(number)}](${link})`)
  assert.deepEqual(
    messagesOf(supersededBy('0002', './0002-next.md')),
    [],
    'a superseded status with a matching link must pass',
  )
  assert.deepEqual(
    messagesOf(supersededBy('0002', './0002-gone.md')),
    ['superseding ADR link does not exist: ./0002-gone.md'],
    'a superseded status pointing at a missing file must be reported',
  )
  assert.deepEqual(
    messagesOf(supersededBy('0002', './0003-other.md')),
    ['superseding ADR link must point at the 0002 file: ./0003-other.md'],
    'a superseded status whose link names another ADR must be reported',
  )

  const index = [
    '# ADR',
    '',
    `運用方針は [${tagOf('0001')}](./0001-sample.md) にある。`,
    '',
    '## 索引',
    '',
    '| 番号 | タイトル | 状態 |',
    '| --- | --- | --- |',
    `| [${tagOf('0001')}](./0001-sample.md) | 判断 | Accepted |`,
  ].join('\n')
  const indexed = [{ number: '0001', basename: '0001-sample.md', status: 'Accepted' }]
  assert.deepEqual(findIndexProblems(index, indexed), [], 'an indexed ADR must pass')
  assert.deepEqual(
    findIndexProblems(index.split('\n').slice(0, -1).join('\n'), indexed),
    [`index has no row linking ${tagOf('0001')} to ./0001-sample.md`],
    'a mention outside the index table must not count as an index row',
  )
  assert.deepEqual(
    findIndexProblems(index, [
      { ...indexed[0], status: `Superseded by [${tagOf('0002')}](./0002-next.md)` },
    ]),
    [`index status of ${tagOf('0001')} must be Superseded`],
    'an index status that disagrees with the ADR must be reported',
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

const problems = []
const readTarget = (path) =>
  existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8') : null

for (const file of files)
  if (
    file.startsWith(`${adrDir}/`) &&
    file.endsWith('.md') &&
    !adrSupportFiles.has(file) &&
    !adrFilePattern.test(file)
  )
    problems.push({ file, message: 'ADR file name must be docs/adr/NNNN-<lowercase-slug>.md' })

const adrFiles = files
  .map((file) => ({ file, match: file.match(adrFilePattern) }))
  .filter(({ match }) => match)
  .map(({ file, match }) => {
    const markdown = readFileSync(file, 'utf8')
    return {
      file,
      number: match[1],
      basename: file.slice(adrDir.length + 1),
      markdown,
      status: markdown.match(/^- 状態: (.+?)\s*$/m)?.[1] ?? null,
    }
  })
  .sort((a, b) => a.number.localeCompare(b.number))

const adrs = {
  numbers: new Set(adrFiles.map(({ number }) => number)),
  basenames: new Set(adrFiles.map(({ basename: name }) => name)),
}

adrFiles.forEach(({ file, number, markdown }, index) => {
  const expected = String(index + 1).padStart(4, '0')
  if (number !== expected)
    problems.push({ file, message: `ADR numbers must be consecutive: expected ${expected}` })
  problems.push(...validateAdr(file, number, markdown, readTarget))
})

const indexPath = `${adrDir}/README.md`
for (const message of findIndexProblems(readTarget(indexPath) ?? '', adrFiles))
  problems.push({ file: indexPath, message })

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
