---
name: issue-dev-orchestrate
description: GitHub issue に登録された仕様を起点に「調査→方針決定→実装→レビュー→テスト→fix」を一気通貫で実行する issue 駆動開発パイプライン。「issue #N を実装して」「/issue-dev-orchestrate N」などで起動。実装はランタイムのネイティブエージェントで行う。
---

# Issue 駆動開発パイプライン

> **本書は手順書ではない。** ゴール・背景・不変条件を共有し、達成方法はあなたに委ねる。
> 各フェーズは「達成すべき状態」と「破ってはならない制約」だけを定める。**より良い進め方を思いついたら、不変条件を守る限りそちらを取ってよい。** ただし手段を変えたことと、その理由は報告する。

## ゴール

GitHub issue に登録された仕様を、**レビュー済み・品質ゲート通過済みのコミット列**として作業ブランチに積み、`develop` 向けPRとして人間のマージ判断に渡す。

完了条件は次の4つ、ならびにスパイクまたはフェーズ分割を伴う作業では5つ目の条件が満たされた状態である。

- 未コミット変更がない
- `develop..HEAD` のすべてのコミットが、現在のHEADまで収束した internal accuracy-first レビューと、有効な仕様準拠レビュー経路を通過している
- 最新のローカル品質ゲート（typecheck / lint / test）が通過し、PR CI の品質ゲート（typecheck / lint / test / build）も通過している
- `develop` 向けPRが作成され、そのURLをユーザーへ報告している
- スパイクまたはフェーズ分割を伴う作業では、明示された関連Issue・撤回／置換PRの状態照合が完了し、現在Issueと明示的に関連するphase Issueに追跡可能な記録がある

## オーケストレーター（このスキル）の責務

調査・実装・レビュー・品質修正は、ネイティブなサブエージェント機能が利用可能で委譲が有効な場合、**原則としてサブエージェントへ委譲する**。利用できない場合は、オーケストレーター自身が対象エージェントの定義と同じ責務・制約で代替する。

エージェント内部の手順・コマンド・認証経路は `.ai/agents/<name>.md` を単一ソースとし、本書では再掲しない。オーケストレーターはブリーフで**ゴール・背景・受け入れ条件・範囲・制約**を渡し、実行手順は各エージェントの定義に委ねる。

オーケストレーター自身が持つ責務は次の3つである。

1. **コミット**: `developer` と `test-fixer` はコミットしない。何を1コミットにまとめるかは常にオーケストレーターが決める。
2. **レビュー境界の管理**: どのコミット範囲がレビュー済みかを追跡し、**未レビューのコードをレビュー済みとして扱わない**。
3. **外部送信の同意取得**: private なコードを外部サービスへ送る操作の直前に、ユーザーの明示同意を取る。

### レビュー用ブリーフの契約

各 review stage で、その reviewer に対応するブリーフを渡す。internal と仕様準拠レビューのブリーフは同じ issue scope を共有するが、`reviewStage` と `committedRange` は各 lane の境界に従う。レビュー用ブリーフには少なくとも次を含める。

- `targetFeature`: 当該 issue で変更する対象機能・振る舞い
- `inScopeFiles`: 修正対象として合意したファイルまたはパス
- `acceptanceCriteria`: 当該 issue の受け入れ条件
- `outOfScopePolicy`: 範囲外の問題は「別issue候補（範囲外）」または「確認事項」として報告し、当該 issue の修正ループと approve / request-changes の判定件数には含めないこと
- `committedRange`: 今回レビューするコミット済み差分の範囲
- `reviewStage`: `internal-initial-cumulative` など、今回のレビューlaneと段階

外部 review stage のブリーフには、`logicalBase` / `externalCoverage` を追加で必須とし、増分時だけ `previousExternalReviewedHead` も含める。外部の `committedRange` は、論理baseではなく正規化済みの `<effective-base SHA>...<current HEAD SHA>` を記録する。

対象範囲はフェーズ2で決定した実装方針と issue の受け入れ条件から具体化する。レビュー時に範囲を推測したり、レビュアーが周辺で見つけた問題を理由に暗黙に広げたりしない。範囲変更が必要なら、その理由と影響を示してユーザー判断を得たうえでブリーフを更新する。

## 不変条件

**これらを破ってはならない。** 「効率的だから」「今回は問題ないから」という理由での逸脱も認めない。ここに書かれていないことは、ゴールを達成する範囲であなたの裁量で決めてよい。

### ブランチとコミット

- `main` では作業せず、`main` に直接コミットしない。作業ブランチは `develop` から切る。
- 作業ブランチ → `develop` のマージ、`develop` → `main` のPR・マージはしない（人間が任意タイミングで行う）。`gh pr merge` は `AGENTS.md` で禁止。
- 作業ツリーが汚れた状態で始めない。ユーザーの無関係な変更を勝手にコミットに含めない。
- 分岐処理の失敗を `|| true` などで隠さない。
- コミットメッセージには `refs #<N>` を含める。PR本文も `refs`（参照のみ）とし、`closes #<N>` は使わない。

### レビューの成立条件

- **レビューが正常完了しなかった状態（失敗・未取得）を approve として扱わない。** これはレビューが実際に行われたことの唯一の担保であり、パイプライン全体で最も重要な不変条件である。
  - 区別すること: レビューが**正常完了**したうえで must-fix / should-fix が0件なら、それは正当な `approve` である（判定規則は `.ai/cross-model-reviewer-common.md`）。禁じているのは、**実行失敗・認証エラー・同意不足などで指摘が得られなかった状態**を「指摘ゼロだから approve」と読み替えることである。
- **CodeRabbit のステータスチェックが緑でも、レビュー済みの根拠にしない。** `develop` 向けPRでは自動レビューが `Review skipped` になるが、チェックは `pass` になる。
- レビュー範囲を推測で決めない。範囲が不明・不正なら停止して報告する。
- 各レビューエージェントの指摘を、オーケストレーターの判断で取捨選択しない。`.ai/review-guidelines.md` の範囲規約に従う区分変更は取捨選択ではなく、対象範囲内の指摘・別issue候補（範囲外）・確認事項へ分類してすべて保持する。

### 外部送信

- private な内容を外部へ送る直前に、**何が送られるかを具体的に列挙して**明示同意を取る。過去の同意・スキル文書・`AGENTS.md` で代用しない。
- **ホストランタイムと同じ提供元のCLIをレビュアーにしない**（独立した第二の目が成立しない）。
- 権限・Sandbox の迂回フラグ（`--dangerously-*` 等）を使わない。

## 背景

- **なぜレビュー境界を記録するか**: 修正周回のたびに全差分を再レビューすると冗長になり、逆に範囲を推測すると未レビューのコミットが素通りする。前回レビュー済みHEADを記録し、その先の増分だけを確実にレビューするための仕組みである。
- **なぜオーケストレーターだけがコミットするか**: 実装者と品質修正者がそれぞれコミットすると、レビュー境界とコミット境界がずれ、増分レビューの前提が崩れる。
- **なぜ別モデルのレビュアーを併用するか**: `reviewer` はホストランタイムと同じモデルで動くため、ホストが見落とした種類の誤りは同じように見落としやすい。別モデルレビュアーはホストと異なる提供元のモデルで、かつ仕様準拠を最優先の観点として差分を読むため、`reviewer`（正確性を最優先）と補完関係になる。
- **なぜホストでレビュアーを切り替えるか**: チームにはホストランタイムが Claude Code の人と Codex の人がいる。使用エージェントを固定すると、片方のホストではレビュアーがホストと同系統のモデルになり「独立した第二の目」が成立しない。
- **なぜ外部送信同意をレビュー直前に取るか**: 何が送られるかはコードが存在して初めて具体的に示せる。実装前の同意では対象を提示できない。
- **なぜ同意が差分だけでは足りないか**: レビュアーCLIはリポジトリ読み取り権限を持ち、`CLAUDE.md` / `AGENTS.md` を自動で読み込み、規約や design.md の該当章、差分の周辺コードも参照する。差分に現れないファイルも送信されうる。
- **なぜ長文ブリーフをファイルへ逃がすか**: 起動プロンプトに長文をインラインで貼るとツール呼び出しが壊れやすく、複数 issue の連続処理で `malformed` エラーを起こす。同じ長い呼び出しをそのまま再送しても直らない。
- **なぜレビュー範囲を固定するか**: 周辺コードや設計文書を読むことは精度を上げるが、そこで見つけた独立問題まで同じ修正ループへ入れると、当該 issue の受け入れ条件と無関係に周回が拡大する。発見は保持しつつ、実装範囲は明示された契約で制御する。

## 実行準備

実行前に `.ai/runtime-compatibility.md` を全文読む。第1引数が issue 番号（**必須**。なければユーザーに確認して停止）。

進捗は利用可能な plan/todo 機能で管理し、各フェーズ完了時に要点を1-2行で報告する。

Codexでは開始直後と完了直前に `./.ai/hooks/log-skill-usage.sh --runtime codex --skill issue-dev-orchestrate --status started|completed` を実行する（Claudeではhookが自動記録する）。

## フェーズ0: 準備

**達成状態**: issue の内容を把握し、`develop` から切った作業ブランチ上にいて、別モデルレビュアーが決まっている。

- issue は認証済みの `gh` CLI で取得する（Codex AppでGitHubコネクタが接続済みならそれでもよい）。
- ブランチ名は `AGENTS.md`「ブランチ戦略」の命名規則に従う。種別は issue のラベル・タイトル・本文から判断し、**迷う場合は `feature`** とする。
- 最新の `origin/develop` を取り込んだ `develop` から切る。`develop` がローカル・リモートともに存在しない初回だけ新規作成し、その旨を報告する。
- **別モデルレビュアーはホストランタイムから一意に決まる**（選択制ではない）。`.ai/runtime-compatibility.md`「別モデルCLIレビューのモデル方針」の表に従う。ホストが判定できない場合は推測せず停止して確認する。

| ホストランタイム | 使うエージェント | 送信先（`egressDestination`） |
|---|---|---|
| Claude Code | `codex-reviewer` | `openai` |
| Codex（App / CLI） | `claude-reviewer` | `anthropic` |

一時ブリーフと記録には `.claude/logs/briefs/`（gitignore 対象、以後 `<scratchpad>` と表記）を使う。決定したレビュアー名と送信先を `<scratchpad>/review-mode-<N>.md` に記録する。

外部送信の同意はここでは取らない（フェーズ5で取る）。

## サブエージェント起動の制約

**長文ブリーフを起動プロンプトに直接インラインで貼らない。** ブリーフは `<scratchpad>` のファイルへ書き、起動プロンプトはそのパスを指すポインタに留める。理由は背景の該当項目にある。

Claude Code は `subagent_type`、Codex は `.codex/agents/<name>.toml` のカスタムエージェントを指定する。種別指定ができない場合のみ、プロンプトで `.ai/agents/<name>.md` を全文読むよう明記する。

## フェーズ1: 調査

**達成状態**: 仕様サマリ・design.md 整合性・影響範囲・実装方針案・テスト観点を含む調査レポートが得られている。

`issue-investigator` エージェントへ委譲する。

## フェーズ2: 方針決定

**達成状態**: 実装方針が確定し、issue に記録されている。

- 調査レポートの推奨案を基本とする。方針が拮抗している、または「要確認事項」が実装内容を左右する場合のみユーザーに確認し、それ以外は推奨案で進む。
- **design.md との乖離が報告された場合は、実装より先に `docs/design.md` を更新する**（仕様駆動開発の原則）。
- 決定した方針と別モデルレビュアー名を issue にコメントで記録する。外部送信同意の原文は転載しない。

## フェーズ3: 実装

**達成状態**: 方針書どおりの実装ができている（未コミットでよい）。

`developer` エージェントへ委譲する。実装対象がバックエンドかフロントエンドかで実装者を切り替えない。

## フェーズ4: 品質ゲートと初期実装コミット

**達成状態**: 3つのローカル品質ゲート（typecheck / lint / test）が通り、今回作業の変更が1コミットになり、作業ツリーがクリーン。

- 品質ゲートは `test-fixer` へ委譲し、`pnpm typecheck` / `pnpm lint` / `pnpm test` を実行する。`pnpm lint` は Biome に加えて depcruise も実行する。各コマンドはリポジトリ全体を検査するため、**失敗時の修正は今回の変更に起因する範囲に絞り、無関係な既存失敗は直さない**。ユーザーの未コミット変更を動かす `git stash` は使わない。
- 品質ゲートが通過した場合だけコミットする。ゲートが未収束のままレビューへ進まない。
- コミットするのはオーケストレーターだけ（不変条件）。今回作業の変更ファイルだけを明示して stage する。

## フェーズ5: 初回のコミット済み差分レビュー

**達成状態**: `develop...HEAD` の committed diff が、current HEAD まで収束した internal accuracy-first レビューの後に、有効な仕様準拠レビュー経路でレビューされ、指摘が統合され、各レビュー境界が記録されている。

### 段階的レビューと範囲

各レビュー周回は、次の順で進める。internal lane が current HEAD まで収束する前に、外部または fallback の仕様準拠レビューを開始してはならない。

1. `last-internal-reviewed-head-<N>.txt` が無ければ `internal-initial-cumulative` として `develop...HEAD` を `reviewer`（`accuracy-first`）でレビューする。存在し、現在のHEADの祖先なら `internal-incremental` としてそのHEAD `...HEAD` をレビューする。存在しない、解決不能、または祖先でない境界を推測して使わない。
2. internal reviewer が `approve` / `request-changes` で正常完了したら、`last-internal-reviewed-head-<N>.txt` を現在のHEADへ更新する。対象範囲内の must-fix / should-fix があればフェーズ6で修正し、次の周回でもこの段階から始める。`approve` になった current HEAD だけが仕様準拠レビューへ進める。
3. `last-external-reviewed-head-<N>.txt` が無ければ、別モデルCLIには `external-initial-cumulative`、`logicalBase: develop`、`committedRange: <merge-base SHA>...<current HEAD SHA>` を渡す。この正規化済みSHA範囲が `git diff develop...HEAD` と等価であることを検証する。fallback の実績や `last-spec-review-*` から外部境界を推測して増分にしてはならない。外部境界が存在し現在のHEADの祖先なら、`external-incremental` として `committedRange: <previous external SHA>...<current HEAD SHA>` を渡す。存在する外部境界が現在のHEADの祖先でなければ、incremental review を拒否して停止・報告する。
4. 外部CLIが利用不能で fallback へ進む場合、current HEAD の internal approve 後に `last-spec-review-head-<N>.txt` を確認する。存在し現在のHEADの祖先なら、routeに関係なく `fallback-incremental` としてそのspec boundary `...HEAD` をレビューする。存在しなければ `fallback-cumulative` として `develop...HEAD` をレビューする。spec boundary が解決不能または祖先でなければ、範囲を推測せず `error` として停止・報告する。実外部境界の有無は fallback range の選択に使わず、fallback は `last-external-reviewed-head-<N>.txt` を更新しない。後から別モデルCLIを試行する場合、実外部境界が無い限り常に `external-initial-cumulative` のままである。

ブリーフには `reviewStage` と、使用した論理base・境界ファイル名を記録し、internal / external / fallback の範囲を取り違えない。

仕様準拠の外部ブリーフには、`reviewStage` / `logicalBase` / `externalCoverage` と、増分時だけ `previousExternalReviewedHead` を必ず含める。`committedRange` は正規化済みSHA範囲だけを記録する。値の妥当性、実効base、分割時のcoverage検証は `.ai/cross-model-reviewer-common.md` が単一ソースであり、同定義が `error` とする不整合を推測で補わない。

累積外部差分が大きく分割が必要な場合は、各chunkの commit SHA と file集合をブリーフに列挙し、正規化済み累積SHA範囲とのunion coverageを検証してから最後に cross-cutting review を行う。欠落または説明できない重複があれば `error` として止め、外部boundaryを更新しない。詳細な検証規則は `.ai/cross-model-reviewer-common.md` に従う。

### 外部送信の明示同意（レビュー実行の直前）

**送信対象はコミット済み差分だけではない。** 次の3種をすべて列挙して同意を取る。

1. `committed-diff` — privateのコミット済み差分（対象issue・ブランチ・base・コミット範囲を明示）
2. `brief-context` — 実装方針の要約・受け入れ条件・issue の内容
3. `repository-reads` — レビュアーがリポジトリから読み取るファイル（差分に現れないものも含む）

internal lane が current HEAD まで `approve` で収束した後、外部CLIを実行する直前に同意を取る。同意の原文・時刻・対象と、`reviewMode: cross-model-cli` / `reviewerAgent` / `egressDestination` / `externalEgressApproved` / `approvedScope` を `<scratchpad>/review-mode-<N>.md` に記録する。**送信先が変われば同意も取り直す。**

同意取得後、スコープ契約、対象issue・実装方針、base・ブランチ・現在の差分範囲に加え、`reviewMode` / `reviewerAgent` / `egressDestination` / `externalEgressApproved` / `approvedScope` / 同意の原文・時刻を仕様準拠レビュー用の1つのレビューブリーフファイルへ統合する。`review-mode-<N>.md` だけをブリーフとして渡して済ませない。Claude CLI にはレビュー指示でこのパスを明示して `Read` させ、Codex CLI には同じファイルの全文を `developer_instructions` で渡す。これにより、仕様準拠レビュアーがスコープ契約と同意記録を自力で検証できる状態にする。

### レビューの実行

- **`reviewer` を先に実行し、その current HEAD への internal lane が `approve` で収束してから**別モデルレビュアーまたは fallback を起動する。二者を並列起動しない。CLIの実行手順・認証確認・権限昇格経路・コマンドフラグ・使用モデル・実効baseの求め方は `.ai/cross-model-reviewer-common.md` と各エージェント定義が単一ソースであり、オーケストレーターは段階・範囲・同意だけを渡す。
- **レビュープロファイルを必ず分ける**（定義は `.ai/review-guidelines.md`）。`reviewer` に `accuracy-first`、別モデルレビュアーと fallback reviewer に `spec-compliance-first`。同じ優先順で読ませると同じ見落とし方をする。
- ブリーフには、**レビュアーがレビュー範囲の正しさを自力で検証できるだけの情報**を渡す。上記レビュー用ブリーフ契約の `targetFeature` / `inScopeFiles` / `acceptanceCriteria` / `outOfScopePolicy` / `committedRange` を各 stage に渡す。不足したままレビューを開始しない。仕様準拠レビュー用ブリーフには同意の網羅性も含める。
- 別モデルレビュアーが `wrong-host-agent` を返した場合は**レビュー未取得fallbackへ進めない**。フェーズ0の表と現在のホストランタイムを再照合し、正しい別モデルレビュアーを選び直して実行する。この再実行を2件目の `reviewer` による代替レビューとして数えない。
- 別モデルレビュアーが `external-egress-confirmation-required` を返した場合は**レビュー未取得fallbackへ進めない**。同意記録に不足している同意項目を具体的に報告し、送信先と `committed-diff` / `brief-context` / `repository-reads` のうち不足した対象を列挙して、今回のレビューに必要な外部送信の明示同意を取得・記録するまで、別モデルレビュアーの再実行も2件目の `reviewer` の起動も行わない。同意の取得・記録後に同じ正しい別モデルレビュアーを再実行し、その実行結果を次の分岐で扱う。
- 正しく選択され、外部送信同意も充足した別モデルレビュアー（`wrong-host-agent` または `external-egress-confirmation-required` 後に再実行した場合を含む）が `approve` / `request-changes` 以外を返した場合に限り、**レビュー未取得**として扱う。理由を報告し、internal lane が current HEAD に収束済みであることを確認したうえで、2件目の `reviewer` を fallback として起動する。このとき **`reviewProfile: spec-compliance-first` をブリーフで明示する**（`reviewer` の既定は `accuracy-first` であり、指定しないと1件目と同じ観点になって仕様準拠が誰にもカバーされない）。あわせて境界条件・保守性・テスト十分性も重点確認させる。
  - `auth-required`（Sandbox 外でも未認証と確認された状態）のときだけ、fallbackの前にユーザーへログインを促し、同じエージェントを再起動してよい。それ以外の判定でCLIを再試行しない。

### CodeRabbit App（補助・任意）

- private リポジトリで CodeRabbit App の自動レビューが有効、または無効と確認できない場合は、PRを作成する前に、送信先が CodeRabbit であることと `committed-diff` / `brief-context` / `repository-reads` を列挙して明示同意を取得する。同意の原文・時刻・対象と `reviewMode: coderabbit-app` / `egressDestination: coderabbit` / `externalEgressApproved: true` / `approvedScope` を `<scratchpad>/review-mode-<N>.md` に記録する。別モデルCLIの送信先に対する同意で代用しない。
- 上記条件で同意を取得・記録できない場合は、自動レビューが無効と確認できるまでPRを作成しない。外部状態の変更などにより明示同意なしに取得された自動Appレビューを統合しない。
- PR作成後に同意済みのAppレビューが得られた場合は追加の指摘として統合に含める。ただし**補助であり、有効なレビュー経路ではない**。Appレビューの有無にかかわらず別モデルCLIレビューを省略しない。
- 単発起動が必要なら `@coderabbitai review` をPRにコメントする直前に、投稿について別途ユーザー承認を得る。自動レビューの外部送信同意を、GitHub上への投稿承認として代用しない。

### 結果の統合

**同一 `ファイル:行` かつ指摘内容が実質的に同じ場合**だけ1件へ束ね（重要度は高い方を採用）、出典タグ（`[codex]` / `[codex-reviewer]` / `[claude]` / `[claude-reviewer]`）は保持する。同じ行でも内容が異なれば両方残す。迷う場合は統合しない。

`reviewer` と別モデルレビュアーが同じコードに異なる重要度を付けるのは、プロファイルが違うため**設計どおり**である。統合漏れではない。

各結果の「指摘一覧」「別issue候補（範囲外）」「確認事項」は区分を保ったまま統合する。オーケストレーターが範囲外候補を must-fix / should-fix に昇格させたり、対象範囲内の指摘を範囲外へ降格させたりしない。分類が食い違う場合は `.ai/review-guidelines.md` の範囲規約と根拠を照合し、確定できなければ確認事項としてユーザー判断へ回す。

今回差分が範囲外機能を実際に壊した回帰、または今回差分が起こしたセキュリティ・データ破壊は対象範囲内の指摘として扱う。今回差分が原因ではない重大な範囲外問題は「別issue候補（範囲外）」に保持する。悪用中・即時のデータ損失など緊急性がある場合だけ、レビュー判定とは別にパイプラインを一時停止してユーザーへエスカレーションし、当該 issue の範囲を広げるか、緊急の別issueとして切り出すかの判断を求める。ユーザーが範囲変更を明示するまで自動修正しない。

### レビュー境界の記録

次の3種類を別々に記録する。欠けた境界を別の記録から推測しない。

- `<scratchpad>/last-internal-reviewed-head-<N>.txt`: current HEAD に対する internal reviewer の正常完了（`approve` / `request-changes`）時だけ更新する。
- `<scratchpad>/last-spec-review-head-<N>.txt` と `<scratchpad>/last-spec-review-route-<N>.txt`: 仕様準拠レビューが正常完了した current HEAD と route（`cross-model-cli` / `fallback-internal`）を組で記録する。fallback はこの仕様境界だけを更新する。
- `<scratchpad>/last-external-reviewed-head-<N>.txt`: 別モデルCLIが `approve` / `request-changes` で正常完了した current HEAD のみを更新する。fallback、timeout、認証・同意・通信エラーは絶対に更新しない。

別モデルCLIの `approve` と `request-changes` はどちらも actual external coverage を確立する。fallback の正常完了は有効な仕様準拠レビュー経路だが、external coverage として表示・記録しない。未取得の理由は必ず報告する。

## フェーズ6: 修正・品質ゲート・周回コミット・増分再レビュー

**達成状態**: must-fix / should-fix が解消され、その修正が1コミットになり、増分がレビュー済みになっている。

- fix 対象は**対象範囲内の** must-fix / should-fix と、今回変更に起因する test-fixer の残課題（nit、「別issue候補（範囲外）」、確認事項は含めない）。空ならフェーズ7へ。
- 修正は `developer`、品質ゲートは `test-fixer` へ委譲する。**当該周回の変更ファイル一覧を確定してブリーフに明記し**、test-fixer はその範囲だけを対象にする。対象外の修正が必要ならスコープを推測で広げず、理由と候補を報告させる。
- 通過後、その一覧のファイルだけを1コミットにする。未コミット変更が残る間は再レビューへ進まない。
- 修正後はフェーズ5の段階的レビューへ戻る。internal lane の既存境界、または incremental に使う実外部 lane の既存境界が不正・現在のHEADの祖先でない場合は、**範囲を推測せず停止して報告する**。internal 境界が無い場合は `develop...HEAD` の cumulative review、実外部境界が無い外部CLIも常に `develop...HEAD` の cumulative review とする。
- 増分レビューでも**新しい明示同意を実行直前に取り直す**（`approvedScope` の3種すべてを再掲）。初回や過去の同意を再利用しない。初回と同じエージェントを使う。
- PR作成済みでAppレビューも参照する場合は、**PRの最新HEADに対する**レビューだけを取り込む。古いHEADのレビューを再レビュー済みとして扱わない。

レビュー境界の更新条件はフェーズ5と同じ。標準運用予算の2周で収束しなければ、残課題を整理して指示を仰ぐ。

## フェーズ7: 完了

**達成状態**: 作業ツリーがクリーンで、コミット列がレビュー済みで、ローカル品質ゲート（typecheck / lint / test）とPR CI（typecheck / lint / test / build）が通過し、`develop` 向けPRが作成され、ユーザーへ報告済み。スパイクまたはフェーズ分割を伴う作業では、関連Issue・撤回／置換PRの状態照合も記録済み。

- **このフェーズで追加コミットは作らない。** 最終確認として作業ツリー・コミット列・ローカル品質ゲート・PR CI の状態を確かめるだけ。
- push とPR作成はユーザー承認を得てから行う。既にPRを作成済みなら再作成しない。
- PR作成には利用可能なら `pr-creator` skill を使い、なければ `.github/pull_request_template.md` に従う。**ベースブランチは `develop`**。
- 完了報告に含めるもの: 実装サマリ／コミット履歴／使用した別モデルレビュアー名と送信先／レビュー結果（未取得ならその理由）／別issue候補（範囲外）と切り出し案／Appレビューを取得した場合はその結果／ローカル品質ゲート（typecheck / lint / test）の結果／PR CI（typecheck / lint / test / build）の結果／作業ブランチ名／PR URL。

### スパイクまたはフェーズ分割時の関連状態照合

スパイクまたはフェーズ分割を伴う作業では、完了報告の前に関連状態を照合し、結果を**現在Issueと明示的に関連する各phase Issue**へ記録する。記録は状態を可視化するためのものであり、Issueの早期close、作業ブランチの自動merge、release自動化を許可しない。コミットとPRの参照は引き続き `refs #<N>` とし、`closes #<N>` は使わない。

- 照合対象は、現在Issueに加え、**現在Issue本文・GitHub sub-issue関係・フェーズ2の実装方針コメント**で親／子／phase／spike／implementation Issue、または撤回／置換PRとして明示されたものだけに限定する。任意の `#<N>` 言及、参考リンク、ボットが生成した「関連する可能性」の提案から対象や関係を推測してはならない。
- 対象ごとに、受け入れ条件、次の5分類からちょうど1つの主分類、残条件、移管先、main反映後のclose候補を記録する。残条件は主分類と併記してよい。
  - develop反映済み・main release待ち
  - 未達・現在Issueに残す
  - 別Issueへ移管済み
  - 外部条件待ち・再開条件あり
  - 不要または置換済み
- 未達条件を移管する場合は、移管先Issueと対応する未達の受け入れ条件を必ず対応付ける。移管先Issueがない場合は未達条件を脱落させず、新規Issue候補として人間判断へ渡す。
- 以前の判断を撤回した場合は、撤回した判断と最終判断を、現在Issueと明示的に関連する各phase Issueから追跡可能にする。撤回／置換PRは、撤回理由・置換先PR・採用する最終結果を記録する。
- Phase 7の最終報告には、対象ごとの主分類、残条件、移管先、main反映後のclose候補を含める。

## 中断・失敗時の原則

- 標準運用予算は、Appレビュー待機10分／修正周回2周／エージェント側の品質ゲート3周。ハード上限ではないが、到達したら自律的な継続を止め、状況・残課題・継続の選択肢を報告して判断を仰ぐ。
- 同じ操作が2回失敗したら、繰り返さず原因を分析して代替アプローチを取る。
- どのフェーズで停止しても、現在のブランチ・完了済みフェーズ・残作業を報告する。
