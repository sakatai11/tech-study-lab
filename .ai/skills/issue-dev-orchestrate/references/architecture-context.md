# Knowledge Graph 開発コンテキスト

`develop-v2` 系統の Issue 開発で常時使用する、構造化アーキテクチャ参照の契約。構造調査は Knowledge Graph から開始し、結果を使って読むコード・型・テスト・設計文書を絞る。設計意図・振る舞い・依存方向の一次ソースは `docs/design.md`、現在構造の一次ソースはコードと設定であり、Graph は探索・照合の入口であって代替仕様ではない。Graph の存在だけで仕様や実行経路を推測してはならない。

## 基底と完了条件

- Issue作業ブランチの統合ブランチは `develop-v2` とし、開始時に `baseBranch: develop-v2` を記録する。既存の `develop` 系統は変更せず、release-main-pr の `develop` → `main` 運用にも触れない。
- 作業ツリーが clean (`git status --short` が空) であることを確認してから `git fetch origin develop-v2` を実行し、最新 `origin/develop-v2` の存在とcommitを `git rev-parse --verify origin/develop-v2^{commit}` で解決・検証する。取得・解決できない場合は停止する。
- `origin/develop-v2` を起点に統合ブランチ `develop-v2` をfast-forwardで更新して新規Issue作業ブランチを切る。既存Issue作業ブランチを継続する場合は、最新 `develop-v2` を通常のmergeで取り込んでから準備完了とする。履歴の破壊的な書き換えやforce操作は行わない。
- 作業ブランチ準備後、必ず `git merge-base --is-ancestor origin/develop-v2 HEAD` を実行する。非祖先の場合は古いまたは別系統の起点として実装へ進まず停止する。
- 祖先性検証後に `git merge-base origin/develop-v2 HEAD` を実行し、その単一結果を `effectiveBase` として固定する。レビューの `committedRange` は常に `<effectiveBase>...HEAD` とする。
- 実行記録と全エージェントへのブリーフには `architectureMode: knowledge-graph`、`baseBranch: develop-v2`、`effectiveBase`、`graphCoverage`、`graphEvidence`、`graphLimitations`、`sourceVerification` を含める。
- 完了条件は、snapshotを再生成・差分照合し、通常の typecheck / lint / test / build に加えて `architecture:check` と `architecture:test` を通過した検証済みコミット列を `develop-v2` 向けPRへ渡すこと。PRのマージは人間が判断する。

## 開始時の基盤確認

`architecture/graph.json`、`scripts/architecture.mjs`、次のpackage scriptが存在することを、Issue変更前に確認する。検査対象は、最新の`origin/develop-v2`を取り込んで祖先性検証を終えたIssue作業ブランチのcheckoutとする。開始時の別ブランチや、更新前のIssue作業ブランチでは実行しない。

```sh
pnpm architecture:check
pnpm architecture:test
```

いずれかが失敗した場合は Knowledge Graph 基盤の不整合として停止し、Issue実装の修正へ混ぜない。snapshotを手編集または再生成して失敗を隠さない。

## Graph-first 調査

Issue と受け入れ条件に現れる endpoint、file、関数、schema などの具体語を seed に、広域のコード検索やファイル読み取りより先に query する。ここでいうGraph-firstは、Issueの仕様分解と必要な`docs/design.md`契約の確認後に行う**リポジトリ構造調査の順序**である。Issue に具体語がない場合は、機能名や変更領域から最小の seed を選ぶための限定的な検索だけを許容し、候補が得られたら直ちに query へ戻る。限定検索でもseed候補を一意に確定できない場合は広域検索へ進まず、`graphCoverage: pending`のまま要確認事項を返して停止する。

```sh
pnpm architecture:query '/dashboard/due-count' 1
pnpm architecture:query 'load-dashboard.ts' 1
```

- 最初は depth 0〜2 に絞り、必要な関係が不足した場合だけ最大4まで広げる。大きなquery結果をそのまま全てブリーフへ貼らない。
- 初回`issue-investigator`への入力だけは `graphCoverage: pending` とし、空の`graphEvidence` / `graphLimitations` / 未実施項目が空の`sourceVerification`を渡す。investigatorは最初のquery後に`pending`を `covered` / `partial` / `outside` / `unmatched` のいずれかへ必ず解消して返す。`pending`をdeveloper以降へ渡さない。
- query後に `graphCoverage` を `covered`（受け入れ条件と実装方針で影響範囲判定に必要としたseed・関係をすべて取得し、残る制限が判定へ影響しない）、`partial`（必要なseed・関係の一部だけ取得）、`outside`（対象領域が抽出器の明示対象外）、`unmatched`（対象領域内だがqueryが一致しない）のいずれかで記録する。複数領域の集約は、query前停止なら`pending`、全領域が明示対象外なら`outside`、対象内の全queryが空かつ対象外領域がなければ`unmatched`、全領域がGraph対象内で全必要関係を取得できれば`covered`、それ以外の混在・truncated・一部取得は`partial`とする。Graph対象内のmatched/covered領域と明示対象外のoutside領域が1件でも混在する場合は、fallback確認の成否にかかわらず必ず`partial`とする。新しいquery証跡を統合するたびにこの順で再計算する。fallbackで不足を補えてもGraph自体が不足している間は`partial`から`covered`へ昇格しない。空結果だけで`outside`と決めず、抽出対象の定義で区別する。空結果を `covered` や「関係なし」と扱わない。
- `graphEvidence` には query語・depth・結果、判断に使った node / edge、Graphが返した関連ファイルだけを要約する。fallbackで発見した対象は`graphEvidence.files`へ混ぜず、実装コードは`sourceVerification.code`、教材Markdownは`sourceVerification.content`、型は`sourceVerification.types`、テストは`sourceVerification.tests`、抽出対象の定義は`sourceVerification.extractor`へ記録する。結果が空なら node / edge / files を空のまま保持し、架空の証跡で補わない。
- `graphEvidence.queries`は各phaseのquery履歴、`nodes` / `edges` / `files`は**最新snapshotの現在状態**とする。実装でnode・edge・fileが削除された場合、削除前の存在は`sourcePhase: investigation`のmatched query、削除後の不在は`sourcePhase: quality`のempty query、削除意図と実装事実は`sourceVerification.issue` / `design` / `code`へ残し、削除済み要素を最新の`nodes` / `edges` / `files`へtombstoneとして残さない。
- 実装後に同じseedがemptyでも、(1) investigation時のmatched証跡、(2) `architecture/graph.json`の対応する削除差分、(3) Issueまたは受け入れ条件上の削除意図、(4) `docs/design.md`との整合、(5) コード差分上の削除事実がすべて一致する場合は、意図した削除のafter証跡として扱う。このquality queryは「対象内の全queryが空」の未一致集計から除外し、意図したpost-change構造に必要な関係をすべて確認できれば`covered`とする。1つでも欠ける、または別node・edgeまで消失した場合は意図しないGraph消失としてcoverageを確定せず、品質ゲート・レビューへ進めない。
- `graphLimitations` には抽出器の制限、未対応構文、対象外領域、判断に使えなかった関係を記録する。
- `covered` では Graph が示したファイルとその直接関係から確認を始める。`partial` / `outside` / `unmatched` / 空結果 / 曖昧な結果の場合だけ、LSP または `rg` で不足部分を検索する。同じ空queryを反復しない。queryがimport hub等で過大・切り詰めになった場合は、depthを下げるか具体的なsymbol/fileへseedを絞り、元queryの限界と絞り直したqueryを両方記録する。
- `sourceVerification` には Graph 結果または fallback で得た候補を、Issue、`docs/design.md`、型、コード、テストのどれで再確認したかを記録する。import edgeを実行証明として扱わない。

全ブリーフと成果物では次のキーと形を使う。値を自由な別名へ置き換えない。各エージェント固有の出力例に`queries / nodes / edges / files`等の説明的な略記があっても代替形式とは扱わず、成果物では次のcanonical YAMLを全サブキーまで完全展開する。オーケストレーターは担当から返った追加証跡をこの形へ統合し、以後は常に最新の統合済み値を渡す。過去の成果物は作成時点の証跡として保持し、書き換えない。

```yaml
architectureMode: knowledge-graph
baseBranch: develop-v2
effectiveBase: <commit SHA>
graphCoverage: pending | covered | partial | outside | unmatched
graphEvidence:
  queries:
    - term: <query seed>
      depth: <0-4>
      result: matched | empty | truncated
      sourcePhase: investigation | implementation | quality | review
  nodes:
    - id: <graph node id>
      kind: <graph node kind>
      source: <file:line>
  edges:
    - from: <graph node id>
      relation: <graph relation>
      to: <graph node id>
      source: <file:line>
  files: [<graphが返したrepository-relative path>]
graphLimitations: []
sourceVerification:
  issue: []
  design: []
  code: []
  content: []
  types: []
  tests: []
  extractor: []
```

初回investigator入力では上記の`queries` / `nodes` / `edges` / `files`をすべて空配列にする。統合時はqueryを`term + depth + sourcePhase`、nodeを`id`、edgeを論理関係の`from + relation + to`、fileをpathで重複排除し、現在のコード状態に対する後続証跡を優先する。同じnodeまたは論理edgeでsource行だけが移動した場合は後続値へ置換して併存させない。実装後snapshotから削除されたnode / edge / fileは最新状態の各配列から除き、削除履歴は上記のphase別queryとsource verificationに保持する。意味・出典ファイルが競合した場合だけ置換理由を`graphLimitations`へ残す。配列順はqueryを`sourcePhase`の列挙順→term→depth、nodeをid、edgeをfrom→relation→to、fileをpathの昇順とする。`sourceVerification`の各要素は`<repository-relative path、Issue、またはdesign節>: <確認した事実>`の文字列とし、分類内の完全一致で重複排除して辞書順に並べる。内容が異なる証跡は保持し、矛盾時は`graphLimitations`へ記録する。`graphLimitations`も完全一致を重複排除して辞書順に並べる。

入力不備を返すerror成果物も7つのトップレベルキーと全サブキーを省略しない。受領できた値はそのまま再掲し、欠落scalarは`not-provided`、欠落した配列は空配列として表現する。error成果物は`### 判定: error`、`### Architecture context`（canonical 7キー）、`### Input contract error`、`- missingFields: [<欠落キーのdot path>]`、`- invalidFields: [<dot path>=<受領した不正値>]`の固定順で出力する。各配列は重複を除き、上記canonical schemaの出現順で並べ、該当がなければ空配列にする。このerror用表現は有効なarchitecture契約ではなく、後続エージェントへ渡さない。

`outside`を使う場合は、抽出対象外と確認した定義元を`sourceVerification.extractor`へ記録する。初回investigator入力では`queries`を空配列にし、`graphCoverage: pending`を使う。

## 実装後の更新とゲート

実装またはfixの後は、変更領域や予想されるGraph差分の有無にかかわらず、オーケストレーターがsnapshotを更新・照合する。

```sh
pnpm architecture:extract
git diff -- architecture/graph.json
```

- graph差分を受け入れ条件、`docs/design.md`、コード差分と照合し、説明できる実差分の場合だけコミット対象へ含める。再生成できたことを設計変更の承認にしない。
- 差分がない場合は、変更が抽出対象外か、抽出対象内でも構造関係が不変なのかを`graphCoverage`と`graphLimitations`に照らして確認する。この場合の`architecture/graph.json`は再生成前とbyte-identicalで、変更ファイル一覧やコミット対象へ含めず、snapshot差分を作業ツリーに残さない。期待しない差分は破棄して通過扱いにせず、原因を解消して再生成するか、判断が必要なら停止する。
- 意図した削除では、削除前matched query、削除後empty query、graph削除差分、Issue・設計・コードの根拠を上記契約どおり照合する。削除後emptyだけを`unmatched`または異常の根拠にしない。
- 期待しないnode/edgeの消失、出典の混線、抽出不能な新構文があれば品質ゲートをpassにしない。
- snapshot差分の意味的照合が完了した後、`test-fixer`が`architecture:check` と `architecture:test` をtypecheck、lint、testへ追加した正式ゲートとしてそれぞれ実行・判定する。オーケストレーターは正式判定を重複実行しない。
- `content/` を変更した場合はオーケストレーターが`content-new`を全文読んで起動し、同スキルに従って`content-author`へ執筆・改訂、`reviewer`へ教材観点レビューを委譲する。`test-fixer`はレビュー結果を受け取り、`pnpm content:sync`または同等のビルド時パースを正式判定する。Graphゲートで教材検証を代替せず、frontmatter、ID、選択肢、`answerIndex`、本文と解説の整合を確認し、結果は`sourceVerification.content`へ記録する。
- 修正周回で抽出対象が変わった場合も、コミット前に同じ更新とゲートを繰り返す。最終HEADでも `test-fixer` が `architecture:check` / `architecture:test` を正式ゲートとして再実行・判定する。

## エージェントへ渡す情報

- 全エージェント: `architectureMode`、`baseBranch`、`effectiveBase`、`graphCoverage`、`graphEvidence`、`graphLimitations`、`sourceVerification` の最新統合済み値を渡す。各成果物にも同じ7キーを再掲する。追加queryや再確認を行った担当は変更後の7項目をオーケストレーターへ返し、後続ブリーフへ統合する。
- `issue-investigator`: Graph-first の query契約に従い、coverageと証跡を調査レポートへ含める。
- `developer`: 渡された node / edge と関連ファイルから読み始める。追加queryは不足関係に限定し、`architecture/graph.json` を手動編集・再生成しない。
- `test-fixer`: Graphから得た影響packageと変更ファイルを原因特定に使う。変更ファイル一覧へ、実際に差分がある場合だけ `architecture/graph.json` を含め、architecture check / test を正式判定する。snapshotは編集・再生成しない。
- `reviewer`: `effectiveBase` を使った `committedRange`、graph差分、調査時 query とcoverageを受け取り、Graphで影響面を絞ってからsnapshot・コード・型・テスト・設計文書を照合する。
- review normalizer: internal reviewerと同じarchitecture項目を必須入力とし、空のGraph結果や対象外状態を推測で補完しない。
