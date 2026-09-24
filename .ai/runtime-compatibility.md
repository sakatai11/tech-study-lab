# Claude Code / Codex 実行互換ルール

このリポジトリでは `.ai/skills/` と `.ai/agents/` を共通定義の一次配置とする。Claude Code は `.claude/`、Codex は `.agents/skills/` からスキルを発見する。Codex固有のカスタムエージェント登録は `.codex/agents/*.toml` で行う。

## ツール名の読み替え

- `Read` / `Grep` / `Glob` / `Bash` / `Edit` / `Write` のような固有名ではなく、各ランタイムで同等の読み取り・検索・コマンド実行・パッチ編集機能を使う。
- 進捗管理は Claude Code では `TodoWrite`、Codex では plan/update 機能を使う。利用できなければ、フェーズ完了時の短い進捗報告で代替する。
- ユーザー確認は Claude Code では `AskUserQuestion`、Codex では利用可能な入力要求機能または通常の質問を使う。
- バックグラウンドプロセスは Claude Code では Bash のバックグラウンド実行、Codex では継続セッション付きコマンド実行を使い、返された ID でログ確認・停止を行う。
- ブラウザ確認は Claude Code では利用可能な Chrome/browser 機能、Codex では in-app browser skill を使う。利用できなければ HTTP レベルの検証まで行い、UI は未確認と報告する。

## GitHub 操作（Claude Code / Codex App / Codex CLI）

- すべてのハーネスで、認証済みの `gh` CLI を使って PR・Issue・レビュー・コメント・レビュー スレッドを取得／作成／更新／解決できる。開始時に `gh auth status` を確認し、失敗した場合は認証を復旧するまでGitHub操作を行わない。
- Codex AppでGitHubコネクタが接続済みの場合は、同等のGitHub操作にコネクタを使ってよい。コネクタは `gh` の必須代替ではない。
- ローカル変更の `git fetch` / `git push` / コミットはコネクタの対象外であり、ローカル Git の認証・権限に従う。
- Sandbox 内の認証確認と外部通信は別々に診断する。`gh auth status`、`codex login status`、`.ai/scripts/run-claude-review.sh auth status` のいずれかが Sandbox 内で未認証を返した場合、ユーザーに再ログインを求める前に、同じ状態確認コマンドだけを正規の承認・権限昇格経路で再実行する。Sandbox 外で認証済みなら、OS keyring または認証キャッシュが不可視だったものとして扱う。
- 認証済みでも API/DNS/接続エラーが出る場合は、対象の読み取りコマンドだけを正規の承認・権限昇格経路で再実行するか、Codex App の接続済みコネクタを使う。通信失敗を未認証と報告しない。
- GitHubコネクタの認証と `gh` / 別モデルレビュー用CLI（Codex CLI・Claude CLI）の認証は共有されない。これらのCLIはGitHubコネクタで代替できないため、CLI自身の認証状態を上記の二段階で確認する。

### 認証preflightと承認の分離

- 別モデルCLIの認証preflightは、そのCLIを実行する可能性が確定した時点で1回だけ行う。`reviewPolicy: always`はフェーズ0、`risk-based`は`externalReviewDecision: required`となった時点、`never`は実施しない。
- Sandbox外の同じ状態確認でも未認証と確認できた場合だけ、ユーザーへCLIのログイン操作を依頼する。Sandbox承認、Keychain不可視、通信失敗、CLI不存在を「ユーザー認証が必要」と表現しない。
- 認証済みならCLI名・バージョン・確認コマンド・時刻・`authReady: true`だけを`<scratchpad>/review-mode-<N>.md`へ記録し、同一スキル実行中は再利用する。トークン、アカウント識別子、認証出力の全文は記録しない。CLIがauth errorを返した、CLI実体が変わった、または別スキル実行になった場合だけ再確認する。
- ランタイムのコマンド実行承認、CLIログイン、private内容の外部送信同意は別の判断である。どれか1つを他の承認として代用しない。ランタイムがセッション限定・対象コマンド限定の承認再利用を提供する場合だけ、同一スキル実行のread-onlyレビューに利用してよい。永続的またはCLI全体を許可する広い承認規則は作らない。

## Claude CLI レビューの認証情報

- Claude CLI で認証確認またはレビューを実行する場合は、`claude` を直接起動せず、`.ai/scripts/run-claude-review.sh` を使う。この wrapper は同じプロセスで `.ai/scripts/load-secrets.sh` を source し、macOS Keychain の `AI_CLAUDE_CODE_OAUTH_TOKEN` / `claude` から取得した値を `CLAUDE_CODE_OAUTH_TOKEN` として環境経由で Claude CLI にだけ引き継ぐ。
- トークンをコマンド引数、標準入力、ログ、ブリーフ、リポジトリ内ファイルへコピーしない。

## サブエージェントの起動

`.ai/agents/<name>.md` を役割の単一ソースとする。

- Claude Code: Agent 機能で `subagent_type: <name>` を指定する。`.claude/agents/<name>.md` は `.ai/agents/<name>.md` へのリンク。
- Codex: `.codex/agents/<name>.toml` に登録されたカスタムエージェント `<name>` を指定して起動する。TOMLの `developer_instructions` が `.ai/agents/<name>.md` を読むよう指示する。Codex に Claude の `subagent_type` や `model: sonnet` を渡さない。
- 現在のCodexツール面でカスタムエージェント種別を直接指定できない場合は、通常のサブエージェントを起動し、プロンプトで `.ai/agents/<name>.md` を全文読むよう明記して代替する。
- サブエージェント機能がない環境: オーケストレーター自身が対象エージェント定義を全文読み、同じ制約で担当作業を実行する。並列レビューは順次実行で代替できる。

このリポジトリでは `<scratchpad>` を `.claude/logs/briefs/` と定義する。長いブリーフは `<scratchpad>` 配下（例: `<scratchpad>/issue-<N>.md`）のgitignore対象一時領域に保存し、サブエージェントにはそのファイルパスを渡す。リポジトリ内の追跡対象へ保存しない。ファイル作成が不要な短い依頼は直接渡してよい。

## 設定とログ

- `.claude/settings.json` の allow/deny と `.codex/hooks.json` の hooks はランタイム固有の生成物である。`.ai/hooks/hooks-source.json` とアダプターを変更したら `pnpm sync:agents` を実行し、`pnpm sync:agents --check` で同期を確認する。
- フックの共通処理本体は `.ai/hooks/`、Claude/Codex の入力差分を吸収するアダプターはそれぞれ `.claude/hooks/` と `.codex/hooks/` に置く。生成物を相互に symlink しない。
- `.ai/logs/skill-usage.jsonl` は両ランタイム共通のローカル利用ログ（gitignore対象）である。`requested` はユーザーの明示指定を検出できた記録、`started` / `completed` はスキル実行の記録である。
- Claude Code は `Skill` hook により `started` / `completed` を自動記録する。Codex はスキル開始直後と完了直前に `./.ai/hooks/log-skill-usage.sh --runtime codex --skill <name> --status started|completed` を実行する。Codex hooks にはスキル起動イベントがないため、明示指定の `requested` とこのライフサイクル記録を組み合わせて検証する。
- Codex のプロジェクトローカル hooks は信頼済みプロジェクトでのみ実行される。信頼確認を迂回する実行オプションは通常利用しない。
- `.claude/skills/` と `.agents/skills/` のリンク先は必ず `.ai/skills/` にそろえ、リンク切れを監査する。
- `.codex/agents/*.toml` の `name` と対応する `.ai/agents/<name>.md` が一致することを監査する。

## Codexサブエージェント本体のモデル方針

`.codex/agents/*.toml` に登録するエージェント**自身**のモデル設定。別モデルCLIレビューで nested に呼ぶモデル（次節）とは別物である。

| 役割 | 標準モデル | reasoning effort | 適用範囲 |
| --- | --- | --- | --- |
| `developer` | `gpt-6-luna` | `xhigh` | 決定済みの実装方針・対象範囲・受け入れ条件に沿う実装 |
| `test-fixer` | `gpt-6-luna` | `high` | 変更起因の型チェック・Biome・テスト失敗の最小修正 |
| `issue-investigator` | `gpt-6-sol` | `medium` | 調査と実装方針の作成 |
| `reviewer` | `gpt-6-sol` | `high` | 正確性を優先する差分レビュー |
| `content-author` | `gpt-6-sol` | `medium` | 教材・問題の執筆と改訂 |
| `codex-review-normalizer` / `claude-review-normalizer` | `gpt-6-luna` | `high` | 別モデルCLIレビュー結果の正規化と仕様照合 |

`developer` と `test-fixer` でLunaを使うのは、方針・対象範囲・受け入れ条件が明確な実装と品質ゲート修正に限定する。review normalizerは、上表のとおり別モデルCLIレビュー結果の正規化と仕様照合にLunaを使う。仕様が曖昧または矛盾している場合、複数領域をまたぐ設計判断が必要な場合、高難度の実装、またはセキュリティレビューでは、Luna担当は `gpt-6-sol` / `high`、Sol担当は `gpt-6-astra` / `high` へ該当TOMLを未コミットのローカル上書きとして一時的に昇格する。品質ゲートの実行およびコミットの前に、役割ごとの標準設定へ復元する。

## 別モデルCLIレビューのモデル方針

レビュー方針で外部レビューが必須となったコミット済み差分は、**ホストランタイムとは別のモデルのCLI**で独立レビューする。使用するCLIと正規化エージェントはホストで決まる。ホストと同じ提供元のCLIを別モデルレビューに使ってはならない（「独立した第二の目」が成立しなくなる）。

| ホストランタイム | 正規化エージェント | オーケストレーターが直接実行するコマンド | モデル指定 | 送信先 |
|---|---|---|---|---|
| Claude Code | `codex-review-normalizer` | `codex exec review --base <effective-base> -c sandbox_mode="read-only"` | `-m gpt-6-sol` | OpenAI |
| Codex（App / CLI） | `claude-review-normalizer` | `git diff <effective-base>...HEAD \| .ai/scripts/run-claude-review.sh -p ...` | `--model opus` | Anthropic |

- モデルは必ず `-m` / `--model` で明示指定する。既定モデルに委ねてはならない。指定モデルが利用可能か、起動前に契約・クライアントの環境で確認する。
- どちらの経路でも、ホストの `reviewer` とは提供元が異なるモデルを使う。レビュー観点の分担は `reviewer` が正確性優先、別モデルCLIと正規化エージェントが仕様準拠優先であり、詳細は `.ai/review-guidelines.md` に従う。

## 別モデルCLIの実行契約

外部レビューが必要な場合、オーケストレーターは上表のCLIを継続セッションで直接起動する。別モデルCLIはサブエージェントから起動しない。レビュー用ブリーフは `<scratchpad>` のファイルとして渡し、長文を起動プロンプトへ直接貼らない。ブリーフは `.ai/cross-model-reviewer-common.md` の契約と同意済みの送信範囲に一致させる。

起動前に `git merge-base <base> HEAD` で単一の effective base を算出し、`git rev-parse --verify <effective-base>^{commit}` で検証する。終了コードが非0、出力が空または複数行、検証失敗のいずれかなら「判定: error」とし、別モデルCLIを実行しない。レビュー対象はコミット済み差分に限り、`git status --short` が空であることとブリーフの `committedRange` が実差分と一致することを確認する。

Codexホストは `.ai/scripts/run-claude-review.sh`、Claude Codeホストは `codex exec review` を使う。`codex exec review` の既定 Sandbox は `workspace-write` なので、`-c sandbox_mode="read-only"` を必ず付ける（`-s` / `--sandbox` は `review` サブコマンドでは使わない）。Claude CLIには `--allowedTools "Read Grep Glob"` と `--disallowedTools "Edit Write NotebookEdit Bash"` を付け、Keychain wrapper以外へ資格情報を渡さない。raw stdout / stderr はファイル、ブリーフ、scratchpadへ永続化せず、正規化に必要な機密を除いた要約だけを渡す。

生存中で無出力のプロセスは `running` とし、5分で停止しない。10分で進捗を通知し、20分で一度だけ終了して「判定: timeout」とする。自動リトライは行わず、timeout・認証・通信・同意不足・実行失敗を `approve` と読み替えない。これらの結果ではFinding台帳とレビュー境界を更新しない。累積discoveryが20分timeoutした場合に限り、commonで定義するcoverage契約に沿ったchunk分割を選べる。これはtimeout後の明示的な例外であり、通常の自動retryではない。

認証preflightの実行時点、`authReady: true` の記録、トークンを保存しない条件、同意の種類とCLI認証を混同しない条件は、このファイルの「認証preflightと承認の分離」に従う。レビュー結果・進捗・エラーを永続化する場合は、機密を含めず、正常レビューの判定に必要なメタ情報だけを記録する。サブエージェント機能がない環境では、オーケストレーター自身が該当エージェント定義を全文読み、同じ制約でCLIを実行する。
