# AIコーディングエージェント連携仕様

## 1. 目的と適用範囲

この仕様書は、**tech-study-lab** で利用するAIコーディングエージェントの設定、共通資産、実行時の差分、検証方法を定義する。対象は Claude Code と Codex App / CLI である。

アプリケーションの設計・機能仕様の一次ソースは [`design.md`](./design.md)。本書はAI開発ハーネスの仕様であり、アプリケーション要件を定義しない。

## 2. エージェント別の対応範囲

| エージェント | 主な役割 | 共通スキル | 共通サブエージェント | hooks | 固有設定 |
| --- | --- | --- | --- | --- | --- |
| Claude Code | 対話型の実装・調査・レビュー | 対応 | 対応 | 対応 | `.claude/settings.json` |
| Codex App / CLI | 対話型の実装・調査・レビュー | 対応 | 対応 | 対応 | `~/.codex/config.toml`、`.codex/agents/*.toml`、`.codex/hooks.json` |

## 3. 共通資産の配置

```text
.ai/                               # ランタイム非依存の一次ソース
├── skills/<name>/SKILL.md          # 再利用可能な開発ワークフロー
├── agents/<name>.md                # サブエージェントの役割・制約
├── hooks/                          # 共通hook処理、fixture、中立定義
├── rules/<name>.md                 # パス別ルール（paths frontmatter付き）
└── runtime-compatibility.md        # Claude/Codexの読み替え規則

.claude/                            # Claude Code固有の発見・配線
├── skills -> ../.ai/skills
├── agents -> ../.ai/agents
├── hooks/                          # Claudeペイロードのアダプター
├── rules/<name>.md -> ../../.ai/rules/<name>.md  # ファイル単位のリンク（自動読み込み入口）
└── settings.json                   # 権限と生成済みhook配線

.agents/                            # Codexのスキル発見入口
└── skills -> ../.ai/skills

.codex/                             # Codex固有の発見・配線
├── agents/<name>.toml              # カスタムエージェント登録
├── hooks/                          # Codexペイロードのアダプター
└── hooks.json                      # 生成済みhook配線
```

### 3.1 編集責務

| 変更対象 | 編集する場所 | 編集してはいけない場所 |
| --- | --- | --- |
| 共通スキル本文 | `.ai/skills/` | `.claude/skills/`、`.agents/skills/` のリンク先以外 |
| 共通エージェント指示 | `.ai/agents/` | `.claude/agents/` |
| Claude/Codex共通hook処理 | `.ai/hooks/` | 設定JSONへ処理をインライン記述すること |
| Claude/Codex入力の正規化 | `.claude/hooks/`、`.codex/hooks/` | 共通処理へ製品固有ペイロードを持ち込むこと |
| パス別ルール | `.ai/rules/`（追加・削除時は `.claude/rules/<name>.md` のリンクと `AGENTS.md` の対応も同じ変更で追加・削除する） | `.claude/rules/` の実体ファイル |

`.claude/skills/`、`.agents/skills/`、`.claude/agents/`、`.claude/rules/` は発見用のシンボリックリンクである。リンクを通常ファイルに置換したり、リンク経由で本文を複製・直接編集したりしない。

## 4. Skills

共通スキルは `.ai/skills/<name>/SKILL.md` を一次ソースとする。Claude Codeは `.claude/skills/` のリンクから、Codexは実行環境で提供されたスキル発見機構を通じて同じ本文を利用する。CLIの発見入口は `.agents/skills/` である。

スキル本文は特定製品のツール名に依存せず、詳細な読み替えは `.ai/runtime-compatibility.md` に集約する。例えば、進捗管理、ユーザー確認、バックグラウンド実行、ブラウザ確認は、各ランタイムに備わる同等機能で実施する。

### 4.1 スキル利用ログ

ログはローカル専用の `.ai/logs/skill-usage.jsonl` にJSON Lines形式で記録する。このディレクトリはGit管理しない。

| status | 意味 | Claude Code | Codex App / CLI |
| --- | --- | --- | --- |
| `requested` | ユーザーが明示指定した | 記録対象外 | `UserPromptSubmit` hookで検出可能な場合に記録 |
| `started` | スキル実行を開始した | `Skill`事前hookが自動記録 | 各`SKILL.md`の開始時手順が記録 |
| `completed` | スキル実行を完了した | `Skill`事後hookが自動記録 | 各`SKILL.md`の完了時手順が記録 |

Codexにはスキル起動そのものを通知するhookイベントがない。そのため、Codexの `requested` は明示指定を検出できた場合だけ、`started` / `completed` はスキル本文が実行する共通ログコマンドで記録する。監査時は `completed` があるものを実行確認済み、`requested` のみを未確認として扱う。

## 5. サブエージェント

サブエージェントの責務・制約の一次ソースは `.ai/agents/<name>.md` である。

### 5.1 Claude Code

Claude Codeは `.claude/agents/<name>.md` のシンボリックリンクを介して、共通Markdown定義をサブエージェントとして利用する。Claude固有のモデルやツール指定をCodexに転記しない。

### 5.2 Codex App / CLI

Codexは `.codex/agents/<name>.toml` でカスタムエージェントを登録する。TOMLには少なくとも `name`、`description`、`developer_instructions` を定義し、`developer_instructions` から対応する `.ai/agents/<name>.md` を読む。

役割ごとのモデルは各TOMLを一次ソースとし、昇格の条件は `.ai/runtime-compatibility.md` に従う。

サブエージェントは、実装したコンテキストから独立させる価値がある役割だけに絞る。現在は `reviewer`（独立レビュー）と `content-author`（教材執筆）の2つである。調査・実装・品質修正は、オーケストレーターが1つのコンテキストで行う。

Codex環境でカスタム種別を指定できない場合は、通常のサブエージェントに `.ai/agents/<name>.md` を全文読むよう指示して代替する。

## 6. Hooks

hookは「共通の処理本体」と「製品固有の入力アダプター」に分ける。Claude/Codex間でイベント名、matcher、入力JSONを直接共有しない。

| 意図 | 共通処理 | Claude Code | Codex App / CLI |
| --- | --- | --- | --- |
| 先送りコメントの阻止 | `.ai/hooks/block-deferred-markers.sh` | `Edit` / `Write` の事前hook | `apply_patch` の事前hook |
| 編集後の整形 | `.ai/hooks/format-changed-file.sh` | `Edit` / `Write` の事後hook | `apply_patch` の事後hook |
| スキルログ | `.ai/hooks/log-skill-usage.sh` | `Skill` の開始・完了hook | 明示指定検出 + スキル本文の開始・完了記録 |

`block-deferred-markers.sh` はコメント中の TODO / FIXME / HACK / XXX を検出して編集を失敗させる。パッチの追加行を示す `+` も検出対象に含む。

Codexのプロジェクトローカルhooksは、プロジェクトが信頼済みの場合にだけ有効となる。信頼確認を迂回する実行オプションは通常使用しない。

## 7. 生成・検証仕様

`.ai/hooks/hooks-source.json` はhookの意図と必須処理を定義する中立ファイルである。`scripts/sync-agent-config.mjs` はこれを検証し、次の生成物を同期する。

| 生成物 | 生成内容 | 温存する内容 |
| --- | --- | --- |
| `.claude/settings.json` | `hooks` キー | Claudeの `permissions` などhooks以外のキー |
| `.codex/hooks.json` | hook設定全体 | なし |

同期スクリプトは一時ファイルへ生成してから置換する。`--check` はファイルを書き換えず、生成物が古い場合に失敗する。

```bash
pnpm sync:agents          # 生成物を更新
pnpm sync:agents --check  # 生成物の同期漏れを検出
pnpm test:hooks           # hook fixture、共通ログ、同期、両ランタイムの構成整合を検証
```

`pnpm test:hooks`（`scripts/test-hooks.sh`）は次を検査する。

1. **hookの動作検証**: Claude/Codexの代表入力fixtureを使い、TODO検出、Codexの明示スキル指定、Claude/Codexのライフサイクルログ、Codexの編集後整形アダプター、`pnpm sync:agents --check` による生成物の同期を確認する。
2. **両ランタイムの構成整合**: `.ai/skills/*`・`.ai/agents/*.md`・`.ai/rules/*.md` ごとに `.claude/` と `.agents/` の発見用リンクがあり `.ai/` を指すこと、取り残しのリンクがないこと、`.ai/agents/<name>.md` と `.codex/agents/<name>.toml` が1対1で `name` が一致すること、パス別ルールが `AGENTS.md` から参照されていること、権限・Sandboxの迂回フラグがハーネスに含まれないことを確認する。
3. **weekly-retro レンダラーの出力検証**と、**`docs/design.md` の章参照の解決検査**（`scripts/test-design-chapter-refs.mjs`）。

契約文書の**文言**は検査しない。文言が存在してもモデルがそれに従う保証にはならず、改善のたびに期待値の更新を強いるためである。文書の内容はレビューで確認する。

このゲートは `.github/workflows/ci.yml` のPR CI（`jq` を含む依存の存在確認つき）で実行され、失敗するとジョブが落ちる。実行時間は約1秒である。実際のCodex App / CLIが外部サービスへ接続してhookを発火する統合テストは、信頼済み環境で別途実施する。

## 8. 恒久ルールと権限

- 共通の開発規約、コマンド、検証手順は `AGENTS.md` に置く。
- パス別ルールは `.ai/rules/` に置く。Claude Code は `.claude/rules/` のリンク経由で自動読み込みし、Codex は `AGENTS.md` の「パス別ルール」の対応から参照する。
- Claudeの `settings.json` にあるallow / denyはCodexの権限を変更しない。
- Codex App / CLIはセッションのsandbox・approval設定と `AGENTS.md` に従う。`gh auth status` が成功した場合は認証済みの `gh` CLI を使える。失敗時はCodex Appの接続済みGitHubコネクタを使い、利用できなければ `auth-required` または `error` として明示的に扱う。

## 9. 変更時の完了条件

| 変更内容 | 必須確認 |
| --- | --- |
| `.ai/skills/` または `.ai/agents/` | Claude/Codexのリンク切れ、対応するCodex agent TOML、`pnpm test:hooks` |
| `.ai/rules/` | `.claude/rules/` のリンク切れ、`AGENTS.md` の「パス別ルール」の対応との一致 |
| `.ai/hooks/`、`.claude/hooks/`、`.codex/hooks/` | `pnpm sync:agents --check` と `pnpm test:hooks` |
| エージェント契約文書（`.ai/skills/`、`.ai/agents/`、`.ai/*.md`、`.ai/automations/`、`.ai/scripts/`、`.codex/agents/`、`.github/ISSUE_TEMPLATE/`、本書 `docs/ai-coding-agents.md`） | `pnpm test:hooks` |
| `.claude/settings.json` のhook配線 | 手編集ではなく `pnpm sync:agents` 後の差分 |
| `.codex/hooks.json` | 手編集ではなく `pnpm sync:agents` 後の差分、信頼済みCodex環境での必要時スモークテスト |

`skill-audit` は共通スキル、リンク、エージェント、hooks、ローカルスキルログをまとめて監査する。AIハーネスの変更後は、必要に応じてこの監査も実行する。
