---
name: issue-dev-orchestrate
description: GitHub issue に登録された仕様を起点に、調査・方針決定・実装・レビュー・品質ゲート・fix を経て develop 向けPRへ渡す issue 駆動開発パイプライン。「issue #N を実装して」「/issue-dev-orchestrate N」などで起動する。
---

# Issue 駆動開発パイプライン

> **本書は手順書ではない。** ゴール・背景・不変条件を共有し、達成方法はあなたに委ねる。
> 各フェーズは達成すべき状態と破ってはならない制約だけを定める。**より良い進め方を思いついたら、不変条件を守る限りそちらを取ってよい。** 手段を変えた場合は理由を報告する。

## ゴール

GitHub issue の仕様を、レビュー済み・品質ゲート通過済みのコミット列として作業ブランチに積み、`develop` 向けPRで人間のマージ判断に渡す。

完了条件は次のとおり。

- 未コミット変更がない。
- `develop..HEAD` の全コミットが、current HEAD の有効な verification 経路を通過している。経路の判定、Finding、レビュー境界は `.ai/cross-model-reviewer-common.md` に従う。
- ローカルの typecheck / lint / test と、PR CI の typecheck / lint / test / build が通過している。
- `develop` 向けPRを作成し、URLをユーザーへ報告している。
- スパイクまたはフェーズ分割を伴う作業では、明示された関連Issue・撤回／置換PRの状態照合が完了している（[references/phase-reconciliation.md](references/phase-reconciliation.md)）。

## オーケストレーターの責務

調査・実装・品質修正は、利用可能なサブエージェントへ原則委譲する。委譲できない場合は、対象エージェント定義を読み、同じ責務と制約で代替する。エージェントの手順・コマンド・認証経路は `.ai/agents/<name>.md` を単一ソースとする。

オーケストレーターが保持する責務は次の3つである。

1. `developer` と `test-fixer` はコミットしない。ゲート通過後に何を1コミットへまとめるかをオーケストレーターが決める。
2. レビュー境界を管理し、未レビューのコードをレビュー済みとして扱わない。
3. private な内容を外部へ送る前の明示同意、同一実行での再利用範囲、再同意条件を管理する。

レビュー範囲、ブリーフの必須フィールド、分類、design.md の章マッピング、重要度は `.ai/review-guidelines.md` を唯一の定義元とする。Finding台帳、reviewPolicy、verification、レビュー境界、外部送信同意、CodeRabbit条件は `.ai/cross-model-reviewer-common.md` を唯一の定義元とする。CLIの選択、認証、effective base、read-only 実行、監視、scratchpad、長文ブリーフの扱いは `.ai/runtime-compatibility.md` を唯一の定義元とする。

## 不変条件

**これらを破ってはならない。** 「効率的だから」「今回は問題ないから」という理由での逸脱も認めない。ここにない実装手段は、ゴールを損なわない範囲で選べる。

### ブランチとコミット

- `main` では作業せず、作業ブランチは `develop` から切る。
- 作業ブランチから `develop` へのマージは行わず、`develop` 向けPRのマージは人間が判断する。`develop` から `main` へのPR作成・マージも人間が行う。作業ブランチへ `develop` を取り込む通常の操作は妨げない。`gh pr merge` は使わない。
- 無関係なユーザー変更をコミットへ含めない。分岐処理の失敗を `|| true` などで隠さない。
- コミットメッセージとPR本文のIssue参照は `refs #<N>` とし、`closes #<N>` は使わない。

### レビューの成立

- **レビューが正常完了しなかった状態（失敗・未取得）を approve として扱わない。** 正常完了後に対象範囲内の must-fix / should-fix が0件なら、それは正当な `approve` である。実行失敗、認証エラー、同意不足などを「指摘ゼロ」と読み替えない。
- レビュー範囲を推測で決めない。各レビュー結果をオーケストレーターの都合で取捨選択せず、`.ai/review-guidelines.md` の分類に従って保持する。
- current HEAD の internal verification `approve`、required Finding 全件 `resolved`、および必要な外部 verification がそろうまでレビュー境界を更新しない。timeout、失敗、未取得では Finding 状態と境界を更新しない。
- `reviewer` と別モデルCLI／正規化エージェントのプロファイルは分ける。定義は `.ai/review-guidelines.md` と `.ai/cross-model-reviewer-common.md` に従う。

### 外部送信と権限

- private な内容を外部へ送る前に、送信する `committed-diff`、`brief-context`、`repository-reads` を具体的に列挙して明示同意を得る。同一実行・同一承認範囲以外の同意で代用しない。
- ホストランタイムと同じ提供元のCLIを別モデルレビューに使わない。権限・Sandbox の迂回フラグを使わない。
- CodeRabbit の自動レビューは補助であり、必要な同意・条件・最新HEADの確認なしに統合しない。別モデルCLIの必須レビューを代替しない。

## 参照マップ

必要な段階で次の資料だけを読む。資料を全文再掲しない。

| 段階 | 参照先 | 目的 |
|---|---|---|
| 実行開始 | `.ai/runtime-compatibility.md` | ランタイム、GitHub、エージェント、CLI、scratchpad の互換条件 |
| 調査・方針 | `.ai/agents/issue-investigator.md`、`docs/design.md` | 仕様、設計整合、影響、方針、テスト観点 |
| discovery / verification 前 | `.ai/review-guidelines.md`、`.ai/cross-model-reviewer-common.md` | 範囲、分類、Finding、判定、同意、境界 |
| 外部CLI実行前 | `.ai/runtime-compatibility.md`、`.ai/cross-model-reviewer-common.md` | CLI、認証、read-only、監視、送信契約 |
| 品質ゲート | `.ai/agents/test-fixer.md` | typecheck、lint（depcruise含む）、test、既存失敗の扱い |
| phase / spike | `references/phase-reconciliation.md` | 関連Issue・撤回／置換PRの状態照合 |
| PR作成前 | `.github/pull_request_template.md`、common の CodeRabbit 節 | PR形式と補助レビュー条件 |

## 実行準備

第1引数は必須のIssue番号である。Issue番号がない場合は停止して確認する。開始時に `.ai/runtime-compatibility.md` を読み、利用可能な plan/todo 機能で進捗を管理する。Codexのスキルライフサイクルログは `.ai/runtime-compatibility.md` の「設定とログ」に従う。

ホストランタイムから別モデルCLI、正規化エージェント、送信先を一意に決める。`reviewPolicy` は `always` / `risk-based` / `never` のいずれかで、ユーザー指定がなければ`risk-based`とする。`never`はユーザーが明示した場合だけ選べる。`<scratchpad>` と認証preflightの扱いは runtime の定義に従う。外部送信同意は実際の対象を列挙できるレビュー直前まで取得しない。

## フェーズと遷移条件

### フェーズ0: 準備

Issueの内容を把握し、最新の `origin/develop` を取り込んだ `develop` 起点の作業ブランチ、`reviewPolicy`、別モデルCLI、正規化エージェント、送信先を決めて記録する。作業開始時に作業ツリーが汚れている場合は、ユーザーの変更を動かさず停止して報告する。ブランチの作成、GitHub認証、CLI認証の条件は参照先へ委ねる。

### フェーズ1: 調査

仕様サマリ、`docs/design.md` 整合性、影響範囲、実装方針案、テスト観点を含む調査レポートを得る。対象が局所的・機械的で方針が確定している場合は、オーケストレーターが `issue-investigator` と同じ責務で調査してよい。それ以外は委譲する。

### フェーズ2: 方針決定

調査レポートを基に方針、対象ファイル、受け入れ条件、`executionOwner: developer | orchestrator` を確定し、Issueへ記録する。`docs/design.md` との乖離があれば実装前に仕様を更新する。方針が拮抗する、または要確認事項が実装を左右する場合だけユーザー判断を求める。実装担当の選定基準は、明確な複数領域・設計判断なら `developer`、局所的で機械的なら `orchestrator` とする。

### フェーズ3: 実装

確定方針と範囲に沿う実装を完了する。`developer`へ委譲した場合は `.ai/agents/developer.md`を読む。`orchestrator`が実装する場合も`.ai/agents/developer.md`を全文読み、同じガードレール・禁止事項・報告契約に従う。実装担当にかかわらず、internal reviewは別の`reviewer`エージェントへ委譲して自己レビューで代替しない。

### フェーズ4: 品質ゲートと初期コミット

`test-fixer`へ品質ゲートを委譲し、typecheck / lint / test の通過と既存失敗の切り分けを得る。ゲート通過後、今回の変更だけをオーケストレーターがコミットする。ゲート未収束のままレビューへ進めない。

### フェーズ5: discovery

`develop...HEAD` の全累積差分を internal `reviewer` が discovery として読み、レビュー用ブリーフと判定記録を整える。`risk-based`ではinternal discoveryを先に実行し、common の規則で外部レビュー要否を決める。外部レビューが required の場合だけ、common と runtime の同意・CLI契約に従い、オーケストレーターが別モデルCLIを直接起動・監視する。結果を common の Finding台帳へ統合する。大きな差分のchunk分割、CodeRabbit、正常でない結果の扱いも common に従う。

### フェーズ6: fix と verification

対象範囲内の must-fix / should-fix と変更起因の品質課題だけを修正する。修正がある周回では、test-fixerへ当該周回の変更ファイル一覧を渡し、ゲート通過後にその一覧のファイルだけを1コミットへまとめ、作業ツリーをcleanにしてから verification へ進む。対象外の修正が必要でも範囲を推測で広げない。Findingが0件でも verification は省略しない。current HEADで internal verification が approve した場合だけ、required なら別モデルCLI verificationを行う。required Finding 全件 resolved、必要な外部 approve、または有効な `not-required-by-policy` 判定がそろうまで境界を更新しない。修正起因回帰、明確な受け入れ条件未達、重大な security / data destruction 以外の独立改善は別Issue候補へ残す。

### フェーズ7: 完了

追加コミットを作らず、作業ツリー、コミット列、レビュー境界、ローカルゲート、PR CIを最終確認する。PR作成・pushはユーザー承認後に行い、ベースは `develop` とする。利用可能なら `pr-creator` skill を使い、既存PRがあれば再作成しない。PR本文はテンプレートに従い、実装、担当、レビュー方針と結果、Finding、ゲート、ブランチ、PR URLを報告する。最終報告は `.ai/cross-model-reviewer-common.md` の出力契約を参照し、`reviewPolicy` / current HEADの`externalReviewDecision` / 規則IDと根拠、使用した別モデルCLI・正規化エージェント名・送信先（未実行・未取得なら理由）、別issue候補（範囲外）と切り出し案、保証低下の有無をユーザーへ伝える。CodeRabbitの適用判定は common の条件に従う。phase / spike がある場合は [references/phase-reconciliation.md](references/phase-reconciliation.md) を読み、明示された関連対象へ状態を記録する。

## 中断・失敗時

標準運用予算は進捗管理の目安であり、到達だけでは自律的な継続を止めない。既存の受け入れ条件と範囲内で解消できる課題は継続する。受け入れ条件・対象範囲・対象機能の実質的拡張、破壊的操作、新しい権限、外部送信同意の範囲拡大が必要なら停止してユーザー判断を求める。同じ操作が2回失敗したら繰り返さず、原因を分析して別の方法を試す。停止時はブランチ、完了済みフェーズ、残作業を報告する。
