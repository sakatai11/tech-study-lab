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

## Claude CLI レビューの認証情報

- Claude CLI で認証確認またはレビューを実行する場合は、`claude` を直接起動せず、`.ai/scripts/run-claude-review.sh` を使う。この wrapper は同じプロセスで `.ai/scripts/load-secrets.sh` を source し、macOS Keychain の `AI_CLAUDE_CODE_OAUTH_TOKEN` / `claude` から取得した値を `CLAUDE_CODE_OAUTH_TOKEN` として環境経由で Claude CLI にだけ引き継ぐ。
- トークンをコマンド引数、標準入力、ログ、ブリーフ、リポジトリ内ファイルへコピーしない。

## サブエージェントの起動

`.ai/agents/<name>.md` を役割の単一ソースとする。

- Claude Code: Agent 機能で `subagent_type: <name>` を指定する。`.claude/agents/<name>.md` は `.ai/agents/<name>.md` へのリンク。
- Codex: `.codex/agents/<name>.toml` に登録されたカスタムエージェント `<name>` を指定して起動する。TOMLの `developer_instructions` が `.ai/agents/<name>.md` を読むよう指示する。Codex に Claude の `subagent_type` や `model: sonnet` を渡さない。
- 現在のCodexツール面でカスタムエージェント種別を直接指定できない場合は、通常のサブエージェントを起動し、プロンプトで `.ai/agents/<name>.md` を全文読むよう明記して代替する。
- サブエージェント機能がない環境: オーケストレーター自身が対象エージェント定義を全文読み、同じ制約で担当作業を実行する。並列レビューは順次実行で代替できる。

長いブリーフは `.claude/logs/briefs/`（gitignore 対象）に保存し、サブエージェントにはリポジトリ相対パスを渡す。ファイル作成が不要な短い依頼は直接渡してよい。

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

- 通常の実装・レビュー・調査・教材執筆・テスト修正には `gpt-5.6-terra` を使う。`developer` と `reviewer` は `high`、その他は `medium` の reasoning effort を使う。
- `codex-reviewer` / `claude-reviewer` エージェント自身（レビュー結果の正規化と `docs/design.md` 該当章の照合を担当）には `gpt-5.6-luna` と `high` reasoning effort を使う。照合には仕様の読み取りと判断が必要なため、正規化だけの作業より高い推論を割り当てる。
- 難易度が高い実装またはセキュリティレビューに限り、該当TOMLの `model` を一時的に `gpt-5.6-sol`、`model_reasoning_effort` を `high` に変更する。作業後は標準設定へ戻す。素の `gpt-5.6` は ChatGPT アカウント認証では使えないため指定しない。

## 別モデルCLIレビューのモデル方針

コミット済み差分の独立レビューは、**ホストランタイムとは別のモデルのCLI**で実行する。使用するエージェントはホストで決まる。ホストと同じ提供元のCLIを別モデルレビュアーとして使ってはならない（「独立した第二の目」が成立しなくなる）。

| ホストランタイム | 使うエージェント | 実行コマンド | モデル指定 |
|---|---|---|---|
| Claude Code | `codex-reviewer` | `codex exec review --base <effective-base> -c sandbox_mode="read-only"` | `-m gpt-5.6-sol` |
| Codex（App / CLI） | `claude-reviewer` | `git diff <effective-base>...HEAD \| .ai/scripts/run-claude-review.sh -p ...` | `--model opus` |

- モデルは必ず `-m` / `--model` で明示指定する。既定モデルに委ねてはならない。
- 別モデルCLIの実行・継続監視はサブエージェントの寿命から切り離し、オーケストレーターが直接担う。CodexホストはClaude CLI、Claude CodeホストはCodex CLIを継続セッションで直接起動する。Claude CLIには `--allowedTools "Read Grep Glob"` と `--disallowedTools "Edit Write NotebookEdit Bash"` の両方を必ず指定する。5分無出力でもrunning、10分で進捗通知、20分で一度だけtimeout終了とする。timeout・失敗・未取得ではFinding台帳やレビュー境界を更新せず、raw stdout/stderrを永続化しない。
- **ChatGPT アカウントで認証した Codex CLI では、素の `gpt-5.6` は使えない**（`The 'gpt-5.6' model is not supported when using Codex with a ChatGPT account.` で 400 になる）。`gpt-5.6-sol` / `gpt-5.6-terra` / `gpt-5.6-luna` のバリアントを指定する。
- `codex exec review` の既定 Sandbox は `workspace-write` である。レビューを読み取り専用に保つため `-c sandbox_mode="read-only"` を必ず付ける（`-s` / `--sandbox` は `review` サブコマンドでは使えない）。
- どちらの経路でも、ホストの `reviewer` とは提供元が異なるモデルが差分を読むため、モデルの独立性は完全である。
- レビュー観点の分担は `reviewer` が正確性優先、別モデルレビュアーが仕様準拠（`.ai/review-guidelines.md` と `docs/design.md`）優先である。モデルを変えるだけでなくこの観点差でも補完させる。
- サブエージェント機能がない環境では、オーケストレーター自身が該当エージェント定義を全文読み、同じ制約でCLIを実行する。
