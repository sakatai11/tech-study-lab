---
name: issue-dev-orchestrate
description: GitHub issue に登録された仕様を起点に、Knowledge Graph による構造調査、方針決定、実装、レビュー、品質ゲート、fix を経て develop 向けPRへ渡す issue 駆動開発パイプライン。「issue #N を実装して」「/issue-dev-orchestrate N」などで起動する。
---

# Issue 駆動開発パイプライン

> **本書は手順書ではない。** ゴール・背景・不変条件を共有し、達成方法はあなたに委ねる。
> 各フェーズは達成すべき状態と破ってはならない制約だけを定める。**より良い進め方を思いついたら、不変条件を守る限りそちらを取ってよい。** 手段を変えた場合は理由を報告する。

## ゴール

GitHub issue の仕様を、レビュー済み・品質ゲート通過済みのコミット列として作業ブランチに積み、`develop` 向けPRで人間のマージ判断に渡す。

このフローでは Knowledge Graph を構造調査の入口として常用する。[references/architecture-context.md](references/architecture-context.md) の契約に従い、広域のコード検索より先に対象を絞った query を行い、その結果から調査・実装・レビューで読む範囲を決める。設計意図・振る舞い・依存方向の一次ソースは引き続き `docs/design.md`、実行コードと設定の一次ソースはリポジトリのコードと設定であり、Graph はそれらを代替しない。

完了条件は次のとおり。

- 今回の作業用checkoutに未コミット変更がない。隔離元のユーザー変更は保持する。
- `develop..HEAD` の全コミットが、current HEAD の有効な verification 経路を通過している。経路の判定、Finding、レビュー境界は `.ai/cross-model-reviewer-common.md` に従う。
- ローカルの typecheck / lint / test / architecture check / architecture test と、PR CI の typecheck / lint / agent contract check（`pnpm test:hooks`）/ test / build（`develop` 向けPRでは architecture check / architecture test も含む）が通過している。エージェント契約文書を変更した場合は、ローカルでも `pnpm test:hooks` が通過している。
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

- `main` では作業せず、Issue作業ブランチは `develop` から切る。
- 作業ブランチから `develop` へのマージは行わず、`develop` 向けPRのマージは人間が判断する。作業ブランチへ `develop` を取り込む通常の操作は妨げない。`gh pr merge` は使わない。
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
| 品質ゲート | `.ai/agents/test-fixer.md` | typecheck、lint（depcruise含む）、test、契約ゲート（`pnpm test:hooks`）、既存失敗の扱い |
| phase / spike | `references/phase-reconciliation.md` | 関連Issue・撤回／置換PRの状態照合 |
| Knowledge Graph | `references/architecture-context.md` | 基盤確認、対象クエリ、evidence、snapshot、追加ゲート |
| PR作成前 | `.github/pull_request_template.md`、common の CodeRabbit 節 | PR形式と補助レビュー条件 |

## 実行準備

第1引数は必須のIssue番号である。Issue番号がない場合は停止して確認する。開始時に `.ai/runtime-compatibility.md` を読み、利用可能な plan/todo 機能で進捗を管理する。Codexのスキルライフサイクルログは `.ai/runtime-compatibility.md` の「設定とログ」に従う。

ブランチ操作より先に `references/architecture-context.md` を読み、既存変更を参照先の保護・継続ルールで確認し、`baseBranch: develop` と `architectureMode: knowledge-graph` を実行記録へ固定する。`effectiveBase` は作業ブランチ準備と `origin/develop` の祖先性検証が完了するまで算出・固定しない。Knowledge Graph の基盤確認は、フェーズ0で準備を終えたIssue作業ブランチのcheckoutに対して行う。初回investigatorには共通実行記録の参照先と調査範囲を渡し、不足する証跡を調査させる。既存変更を保護できない場合や基盤確認に失敗した場合は該当作業へ進まない。

ホストランタイムから別モデルCLI、正規化エージェント、送信先を一意に決める。`reviewPolicy` は `always` / `risk-based` / `never` のいずれかで、ユーザー指定がなければ`risk-based`とする。`never`はユーザーが明示した場合だけ選べる。`<scratchpad>` と認証preflightの扱いは runtime の定義に従う。外部送信同意は実際の対象を列挙できるレビュー直前まで取得しない。

## フェーズと遷移条件

### フェーズ0: 準備

Issueの内容を把握し、次の順序で `develop` 起点のIssue作業ブランチを準備する。

- 既存変更の保護を確認後、`git fetch origin develop` で最新のリモート追跡参照を取得し、`git rev-parse --verify origin/develop^{commit}` で存在とcommit解決を確認する。取得・解決できない場合は停止する。
- `origin/develop` を起点に統合ブランチ `develop` をfast-forwardで更新して新規Issue作業ブランチを切る。既存Issue作業ブランチを継続する場合は、最新 `develop` を通常のmergeで取り込んでから準備完了とする。履歴の破壊的な書き換えやforce操作は行わない。
- 作業ブランチ準備後、必ず `git merge-base --is-ancestor origin/develop HEAD` を実行する。非祖先の場合は古いまたは別系統の起点として実装へ進まず停止する。
- 祖先性検証後に `git merge-base origin/develop HEAD` を実行し、その単一結果を `effectiveBase` として固定する。`architectureMode: knowledge-graph`、`baseBranch: develop`、`reviewPolicy`、別モデルCLI、正規化エージェント、送信先も記録する。
- 作業ブランチの準備と祖先性検証が完了したcheckoutで `pnpm architecture:check` と `pnpm architecture:test` を実行する。いずれかが失敗した場合はIssue実装へ進まず、Knowledge Graph基盤の不整合として報告する。

既存変更の保護・継続・隔離と再開時のbase確認は`references/architecture-context.md`に従う。正式レビューは対象HEADのcleanなcheckoutで行う。

### フェーズ1: 調査

仕様サマリ、`docs/design.md` 整合性、影響範囲、実装方針案、テスト観点を含む調査レポートを得る。Issueの具体語を seed に architecture query を先に実行し、`graphCoverage`、`graphEvidence`、`graphLimitations` を記録する。Graphが示した関係から読む範囲を絞り、コード、型、テスト、`docs/design.md` で再確認して `sourceVerification` を残す。`partial` / `outside` / `unmatched` / 空結果 / 曖昧な結果の場合だけ LSP・`rg` へフォールバックし、空結果を無関係の証明にしない。対象が局所的・機械的で方針が確定している場合は、オーケストレーターが `issue-investigator` と同じ責務で調査してよい。それ以外は委譲する。

### フェーズ2: 方針決定

調査レポートを基に方針、対象ファイル、受け入れ条件、`executionOwner: developer | orchestrator` を確定し、Issueへ記録する。`architectureMode: knowledge-graph`、`baseBranch: develop`、`effectiveBase`、`graphCoverage`、`graphEvidence`、`graphLimitations`、`sourceVerification` を共通実行記録へ保持し、各担当へ参照先と必要な範囲を渡す。`docs/design.md` との乖離があれば実装前に仕様を更新する。方針が拮抗する、または要確認事項が実装を左右する場合だけユーザー判断を求める。実装担当の選定基準は、明確な複数領域・設計判断なら `developer`、局所的で機械的なら `orchestrator` とする。

### フェーズ3: 実装

確定方針と範囲に沿う実装を完了する。`content/`の執筆・改訂を含む場合は、オーケストレーターが`content-new`を全文読んで起動し、contentファイルは`content-author`、教材観点レビューは`reviewer`へ同スキルの契約どおり委譲する。コード変更が併存する場合だけ、そのコード部分を通常の`developer`経路で扱う。`developer`へ委譲した場合は `.ai/agents/developer.md`を読む。`orchestrator`が実装する場合も`.ai/agents/developer.md`を全文読み、同じガードレール・禁止事項・報告契約に従う。共通architecture契約を方針書へ渡し、Graphが示す関連ファイルから実装確認を始めさせる。追加queryやfallbackで証跡が増えた場合は報告から回収して共通契約を更新する。`architecture/graph.json` は実装担当に手編集・再生成させない。実装担当にかかわらず、internal reviewは別の`reviewer`エージェントへ委譲して自己レビューで代替しない。

### フェーズ4: 品質ゲートと初期コミット

オーケストレーターは`references/architecture-context.md`に従って必要なsnapshot更新と差分照合を行う。説明不能な差分は原因を解消し、品質ゲートをpassにしない。`test-fixer`へ変更範囲と証跡を渡し、有効な結果の再利用と未検証ゲートの実行により必要な品質ゲートを揃える。教材変更は`content-new`のレビュー・パース検証も含める。エージェント契約文書（`.ai/skills/`、`.ai/agents/`、`.ai/*.md`、`.ai/automations/`、`.ai/scripts/`、`.codex/agents/`、`.github/ISSUE_TEMPLATE/`、`docs/ai-coding-agents.md`）が変更ファイルに含まれる場合は、`pnpm test:hooks` を正式ゲートへ含める。ゲート通過後、今回の変更と実差分のあるsnapshotだけをコミットする。

### フェーズ5: discovery

`<effectiveBase>...HEAD` の全累積差分を internal `reviewer` が discovery として読み、レビュー用ブリーフと判定記録を整える。ブリーフには共通architecture契約とgraph差分を含め、reviewerはGraph evidenceから影響面を絞ってからコード・型・テスト・設計文書を照合する。`risk-based`ではinternal discoveryを先に実行し、common の規則で外部レビュー要否を決める。外部レビューが required の場合だけ、common と runtime の同意・CLI契約に従い、オーケストレーターが別モデルCLIを直接起動・監視する。結果を common の Finding台帳へ統合する。大きな差分のchunk分割、CodeRabbit、正常でない結果の扱いも common に従う。

### フェーズ6: fix と verification

対象範囲内の must-fix / should-fix と変更起因の品質課題だけを修正する。修正後のsnapshotと品質ゲートはフェーズ4と同じ契約を適用する。検証済みの今回の変更だけをコミットし、正式レビュー用checkoutをcleanにする。対象外の修正が必要でも範囲を推測で広げない。verificationの成立と低リスク時のdiscovery結果再利用はcommonの「有効なverification経路」に従う。current HEADで internal verification が approve した場合だけ、required なら別モデルCLI verificationを行う。required Finding 全件 resolved、必要な外部 approve、または有効な `not-required-by-policy` 判定がそろうまで境界を更新しない。修正起因回帰、明確な受け入れ条件未達、重大な security / data destruction 以外の独立改善は別Issue候補へ残す。

### フェーズ7: 完了

追加コミットを作らず、作業ツリー、コミット列、レビュー境界、ローカルゲートを最終確認する。PR CIも確認し、PR作成・pushはユーザー承認後に行い、ベースは `develop` とする。利用可能なら `pr-creator` skill を使い、既存PRがあれば再作成しない。PR本文は、実装、担当、レビュー方針と結果、Finding、ゲート、ブランチ、共通architecture契約を含める。最終報告は `.ai/cross-model-reviewer-common.md` の出力契約を参照し、`reviewPolicy` / current HEADの`externalReviewDecision` / 規則IDと根拠、使用した別モデルCLI・正規化エージェント名・送信先（未実行・未取得なら理由）、別issue候補（範囲外）と切り出し案、保証低下の有無をユーザーへ伝える。graph coverage、evidence、差分、limitations、source verificationも報告する。CodeRabbitの適用判定は common の条件に従う。phase / spike がある場合は [references/phase-reconciliation.md](references/phase-reconciliation.md) を読み、明示された関連対象へ状態を記録する。

## 中断・失敗時

標準運用予算は進捗管理の目安であり、到達だけでは自律的な継続を止めない。既存の受け入れ条件と範囲内で解消できる課題は継続する。受け入れ条件・対象範囲・対象機能の実質的拡張、破壊的操作、新しい権限、外部送信同意の範囲拡大が必要なら停止してユーザー判断を求める。同じ操作が2回失敗したら繰り返さず、原因を分析して別の方法を試す。停止時はブランチ、完了済みフェーズ、残作業を報告する。
