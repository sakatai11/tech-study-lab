# Knowledge Graph 開発コンテキスト

`develop-v2` 系統の Issue 開発で常時使用する、構造化アーキテクチャ参照の契約。構造調査は Knowledge Graph から開始し、結果を使って読むコード・型・テスト・設計文書を絞る。設計意図・振る舞い・依存方向の一次ソースは `docs/design.md`、現在構造の一次ソースはコードと設定であり、Graph は探索・照合の入口であって代替仕様ではない。Graph の存在だけで仕様や実行経路を推測してはならない。

## 基底と完了条件

- Issue作業ブランチの統合ブランチは `develop-v2` とし、開始時に `baseBranch: develop-v2` を記録する。既存の `develop` 系統は変更せず、release-main-pr の `develop` → `main` 運用にも触れない。
- 作業開始時は`git status --short`と差分で、今回の継続変更とユーザー所有・不明な変更を識別する。今回の継続変更は保持して進める。無関係な変更は触れず、必要ならcleanな別worktreeへ作業を隔離する。重なりや所有を解消できない場合だけ該当作業を止めて確認する。ユーザー変更を自動stash・破棄・コミットしない。
- `git fetch origin develop-v2`後、`git rev-parse --verify origin/develop-v2^{commit}`でremote baseを検証する。checkoutやmergeは対象worktreeで変更を保護できる状態で行う。同一作業の再開で固定済みbaseが有効なら準備を繰り返さず、base更新が必要なら継続変更を保護できる段階で行う。
- `origin/develop-v2` を起点に統合ブランチ `develop-v2` をfast-forwardで更新して新規Issue作業ブランチを切る。既存Issue作業ブランチを継続する場合は、最新 `develop-v2` を通常のmergeで取り込んでから準備完了とする。履歴の破壊的な書き換えやforce操作は行わない。
- 作業ブランチ準備後、必ず `git merge-base --is-ancestor origin/develop-v2 HEAD` を実行する。非祖先の場合は古いまたは別系統の起点として実装へ進まず停止する。
- 祖先性検証後に `git merge-base origin/develop-v2 HEAD` を実行し、その単一結果を `effectiveBase` として固定する。レビューの `committedRange` は常に `<effectiveBase>...HEAD` とする。
- 共通の実行記録にモード、base、調査証跡を保持し、エージェントには参照先と担当範囲を渡す。
- 完了条件は、snapshotを再生成・差分照合し、通常の typecheck / lint / test / build に加えて `architecture:check` と `architecture:test` を通過した検証済みコミット列を `develop-v2` 向けPRへ渡すこと。PRのマージは人間が判断する。

## 開始時の基盤確認

`architecture/graph.json`、`scripts/architecture.mjs`、次のpackage scriptが存在することを、Issue変更前に確認する。検査対象は、最新の`origin/develop-v2`を取り込んで祖先性検証を終えたIssue作業ブランチのcheckoutとする。開始時の別ブランチや、更新前のIssue作業ブランチでは実行しない。

```sh
pnpm architecture:check
pnpm architecture:test
```

いずれかが失敗した場合は Knowledge Graph 基盤の不整合として停止し、Issue実装の修正へ混ぜない。snapshotを手編集または再生成して失敗を隠さない。

## Graph-first 調査

Issue と受け入れ条件に現れる endpoint、file、関数、schema などの具体語を seed に、広域のコード検索やファイル読み取りより先に query する。ここでいうGraph-firstは、Issueの仕様分解と必要な`docs/design.md`契約の確認後に行う**リポジトリ構造調査の順序**である。Issue に具体語がない場合は、機能名や変更領域から最小の seed を選ぶための限定的な検索だけを許容し、候補が得られたら直ちに query へ戻る。候補が複数なら関連する候補をqueryし、不足はLSP・`rg`で補う。調査を続けても仕様・対象範囲・必要な権限を確定できない場合に、要確認事項を報告する。

```sh
pnpm architecture:query '/dashboard/due-count' 1
pnpm architecture:query 'load-dashboard.ts' 1
```

- 最初は depth 0〜2 に絞り、必要な関係が不足した場合だけ最大4まで広げる。大きなquery結果をそのまま全てブリーフへ貼らない。
- 未調査は`pending`としてよい。担当が必要な調査を補い、判断に必要な根拠を揃える。状態ラベルや未使用項目の欠落だけを停止理由にしない。
- coverageは`covered`（必要な構造を確認済み）、`partial`（一部不足または対象内外の混在）、`outside`（抽出対象外）、`unmatched`（対象内だが一致なし）で要約する。対象外は抽出器の定義で確認し、空結果を無関係の証明にしない。判断に影響する不足と追加確認を記録する。
- `graphEvidence` には query語・depth・結果、判断に使った node / edge、Graphが返した関連ファイルだけを要約する。fallbackで発見した対象は`graphEvidence.files`へ混ぜず、実装コードは`sourceVerification.code`、教材Markdownは`sourceVerification.content`、型は`sourceVerification.types`、テストは`sourceVerification.tests`、抽出対象の定義は`sourceVerification.extractor`へ記録する。結果が空なら node / edge / files を空のまま保持し、架空の証跡で補わない。
- query結果は対象のコード状態と対応付ける。最新のnode / edge / fileと過去の証跡を区別し、削除済み要素を現存するものとして引き継がない。
- 削除後の空queryは、仕様・コード変更・snapshot差分から意図した削除と説明できれば正常として扱う。調査時のmatched記録は必須ではない。説明不能な消失は原因を調べ、未解消のままゲートをpassにしない。coverageは変更後に必要な構造に対して判断する。
- `graphLimitations` には抽出器の制限、未対応構文、対象外領域、判断に使えなかった関係を記録する。
- `covered` では Graph が示したファイルとその直接関係から確認を始める。`partial` / `outside` / `unmatched` / 空結果 / 曖昧な結果の場合だけ、LSP または `rg` で不足部分を検索する。同じ空queryを反復しない。queryがimport hub等で過大・切り詰めになった場合は、depthを下げるか具体的なsymbol/fileへseedを絞り、元queryの限界と絞り直したqueryを両方記録する。
- `sourceVerification` には Graph 結果または fallback で得た候補を、Issue、`docs/design.md`、型、コード、テストのどれで再確認したかを記録する。import edgeを実行証明として扱わない。

## 証跡の受け渡し

オーケストレーターは共通の実行記録を一か所に保持する。以下は記録項目の目安であり、空欄の展開や配列の並び順は要求しない。

- `architectureMode: knowledge-graph`、`baseBranch: develop-v2`、`effectiveBase`
- `graphCoverage`、`graphEvidence`（query・判断に使ったnode / edge / file）
- `graphLimitations`（判断に影響する制限）
- `sourceVerification`（一次ソースの参照先と確認した事実。code / content / types / tests等で必要に応じ分類）

ブリーフには実行記録の読み取り可能な参照先と対象revisionを渡す。参照を共有できない環境では必要な範囲を添付する。各担当は参照した記録と追加・変更した証跡だけを返し、変更がなければその旨を記す。オーケストレーターが統合し、後続へ最新の記録を渡す。形式のための全文再出力は不要。

不足は参照先や追加調査から補う。仕様・対象範囲・base・権限に関する不足や矛盾を解消できない場合は、`error`と不足内容・必要な判断を簡潔に報告する。未確認の値を捏造せず、errorを成功した成果物として後続へ渡さない。

## 実装後の更新とゲート

実装またはfixの後は、抽出入力（コード・設定・抽出器・依存）に影響する変更がある場合、または影響を判断できない場合に、オーケストレーターがsnapshotを更新・照合する。明示対象外だけの変更なら再生成は不要だが、`architecture:check`による鮮度確認は維持する。

```sh
pnpm architecture:extract
git diff -- architecture/graph.json
```

- graph差分を受け入れ条件、`docs/design.md`、コード差分と照合し、説明できる実差分の場合だけコミット対象へ含める。再生成できたことを設計変更の承認にしない。
- 差分がない場合は、変更が抽出対象外か、抽出対象内でも構造関係が不変なのかを`graphCoverage`と`graphLimitations`に照らして確認する。この場合の`architecture/graph.json`は再生成前とbyte-identicalで、変更ファイル一覧やコミット対象へ含めず、snapshot差分を作業ツリーに残さない。期待しない差分は破棄して通過扱いにせず、原因を解消して再生成するか、判断が必要なら停止する。
- 削除後の空結果は上記の削除方針で照合する。
- 期待しないnode/edgeの消失、出典の混線、抽出不能な新構文があれば品質ゲートをpassにしない。
- snapshot差分を照合した後、`test-fixer`が通常ゲートと`architecture:check` / `architecture:test`の結果を確認する。
- `content/` を変更した場合はオーケストレーターが`content-new`を全文読んで起動し、同スキルに従って`content-author`へ執筆・改訂、`reviewer`へ教材観点レビューを委譲する。`test-fixer`はレビュー結果を受け取り、`pnpm content:sync`または同等のビルド時パースを正式判定する。Graphゲートで教材検証を代替せず、frontmatter、ID、選択肢、`answerIndex`、本文と解説の整合を確認し、結果は`sourceVerification.content`へ記録する。
- 検証結果には対象revisionまたは入力内容、コマンド、実行条件、終了結果を残す。同じ入力・条件に対する成功結果は担当交代やコミットだけで再実行せず引き継げる。コード・依存・設定・環境の変更、証跡不足、失敗があれば影響する検証を再実行する。最終HEADに必要な全ゲートの有効な証跡があることを確認する。

## エージェントへ渡す情報

- 全エージェント: 共通記録の参照先と担当範囲を受け取り、追加・変更した証跡を返す。
- `issue-investigator`: Graph-first の query契約に従い、coverageと証跡を調査レポートへ含める。
- `developer`: 渡された node / edge と関連ファイルから読み始める。追加queryは不足関係に限定し、`architecture/graph.json` を手動編集・再生成しない。
- `test-fixer`: Graphから得た影響packageと変更ファイルを原因特定に使う。変更ファイル一覧へ、実際に差分がある場合だけ `architecture/graph.json` を含め、architecture check / test を正式判定する。snapshotは編集・再生成しない。
- `reviewer`: `effectiveBase` を使った `committedRange`、graph差分、調査時 query とcoverageを受け取り、Graphで影響面を絞ってからsnapshot・コード・型・テスト・設計文書を照合する。
- review normalizer: internal reviewerと同じ共通記録を参照し、空結果や対象外状態を推測で補完しない。
