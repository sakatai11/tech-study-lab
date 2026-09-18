// docs/design.md の章参照が実在する見出しへ解決されることを検査する（Issue #182）。
//
// 章番号の変更・削除・章の統廃合で、リポジトリ中の参照が黙って腐ることを防ぐ。
// 検査するのは参照の解決可能性だけであり、参照先の章が妥当かどうかは扱わない。
// 領域から読む章を引く対応表の単一ソースは `.ai/review-guidelines.md` であり、
// Knowledge Graph は設計契約への参照を持たない（`architecture/README.md`）。
//
// 対象とする3形式:
//   §8.3                               章番号（`§` はリポジトリ規約として design.md の章を指す）
//   design.md 8.3                       `§` を伴わない本文中の参照
//   design.md#<見出しスラッグ>          Markdown リンクの anchor
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const designPath = 'docs/design.md'

/** GitHub の見出しスラッグ規則: 小文字化し、記号を除去し、空白を `-` へ置換する。 */
export function slugify(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-')
}

/** `##`〜`####` の見出しから、解決可能な章番号と anchor スラッグを集める。 */
export function collectHeadings(markdown) {
  const numbers = new Set()
  const slugs = new Set()

  for (const line of markdown.split('\n')) {
    const heading = line.match(/^#{2,4} (.+?)\s*$/)
    if (!heading) continue
    slugs.add(slugify(heading[1]))
    const numbered = heading[1].match(/^([0-9]+(?:\.[0-9]+)*)[.．\s]/)
    if (numbered) numbers.add(numbered[1])
  }

  return { numbers, slugs }
}

/** 1ファイル分の未解決参照を、出典行付きで返す。 */
export function findUnresolvedRefs(file, text, headings) {
  const unresolved = []

  text.split('\n').forEach((line, index) => {
    const report = (ref) => unresolved.push({ file, line: index + 1, ref })

    for (const match of line.matchAll(/§([0-9]+(?:\.[0-9]+)*)/g))
      if (!headings.numbers.has(match[1])) report(match[0])
    for (const match of line.matchAll(/design\.md ([0-9]+(?:\.[0-9]+)*)/g))
      if (!headings.numbers.has(match[1])) report(match[0])
    for (const match of line.matchAll(/design\.md#([^\s)"'\]）」』】、。,`<>${}]+)/g))
      if (!headings.slugs.has(match[1])) report(match[0])
  })

  return unresolved
}

/** 参照切れを実際に検出できることの回帰テスト。 */
function selfTest() {
  // この検査自身も走査対象に含まれるため、fixture の参照をソース上へ literal で残さない。
  // 実在しない章を literal で書くと、この検査が自分の fixture を未解決参照として落とす。
  const chapter = (number) => `§${number}`
  const bare = (number) => `design.md ${number}`
  const anchor = (slug) => `design.md#${slug}`

  const headings = collectHeadings(
    [
      '## 8. フロントエンドアーキテクチャ（How）',
      '### 8.3 Server / Client コンポーネント境界',
    ].join('\n'),
  )

  assert.deepEqual(headings.numbers, new Set(['8', '8.3']))
  assert.deepEqual(
    findUnresolvedRefs('fixture', `${chapter('8')} と ${bare('8.3')} を参照する`, headings),
    [],
    'resolvable chapter references must not be reported',
  )
  assert.deepEqual(
    findUnresolvedRefs(
      'fixture',
      `[境界](${anchor('83-server--client-コンポーネント境界')})`,
      headings,
    ),
    [],
    'resolvable anchors must not be reported',
  )
  assert.deepEqual(
    findUnresolvedRefs('fixture', `${chapter('8.9')} と ${bare('9.1')} は存在しない`, headings).map(
      (item) => item.ref,
    ),
    [chapter('8.9'), bare('9.1')],
    'deleted or renumbered chapters must be reported',
  )
  assert.deepEqual(
    findUnresolvedRefs('fixture', `[境界](${anchor('83-server-client')})`, headings).map(
      (item) => item.ref,
    ),
    [anchor('83-server-client')],
    'anchors that no longer match a heading must be reported',
  )
  assert.deepEqual(
    findUnresolvedRefs(
      'fixture',
      `境界は（${anchor('83-server--client-コンポーネント境界')}）を参照する`,
      headings,
    ),
    [],
    'full-width punctuation must not be swallowed into the anchor',
  )
  assert.deepEqual(
    findUnresolvedRefs('fixture', '形式は `design.md#<見出しスラッグ>` と表記する', headings),
    [],
    'placeholders that describe the anchor form must not be treated as references',
  )
}

selfTest()

const headings = collectHeadings(readFileSync(designPath, 'utf8'))
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)

const unresolved = []
let scanned = 0
let referenced = 0

for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (text.includes('\0')) continue

  scanned += 1
  const found = findUnresolvedRefs(file, text, headings)
  if (/§[0-9]|design\.md[ #][0-9a-z]/i.test(text)) referenced += 1
  unresolved.push(...found)
}

if (unresolved.length > 0) {
  for (const item of unresolved)
    process.stderr.write(
      `unresolved design.md chapter reference: ${item.ref} (${item.file}:${item.line})\n`,
    )
  process.stderr.write(
    `${unresolved.length} reference(s) do not resolve to a heading in ${designPath}. Update the reference or restore the chapter.\n`,
  )
  process.exit(1)
}

process.stdout.write(
  `design.md chapter references resolved (${referenced} referencing file(s) of ${scanned} scanned, ${headings.numbers.size} chapters).\n`,
)
