# Claude Code / Codex CLI 共存方針

Claude Code と Codex CLI のどちらでも、同じ開発フローを安全に実行できるようにするための運用方針。本書は現在の実装と運用ルールを示す。製品仕様の一次ソースは引き続き [`design.md`](./design.md) である。

## 共通定義

```text
.ai/
├── skills/                    # 共通スキルの一次ソース
├── agents/                    # 共通エージェント指示の一次ソース
├── hooks/                     # 共通フック処理・中立定義・fixture
└── runtime-compatibility.md   # ランタイム差分の読み替え規則

.claude/
├── skills -> ../.ai/skills
├── agents -> ../.ai/agents
├── hooks/                     # Claude入力を共通処理へ正規化するアダプター
└── settings.json              # Claude専用の権限・生成済みhook配線

.agents/
└── skills -> ../.ai/skills    # Codexがネイティブ探索する発見入口

.codex/
├── agents/*.toml              # Codexネイティブのエージェント登録
├── hooks/                     # Codex入力を共通処理へ正規化するアダプター
└── hooks.json                 # 生成済みのCodex hook配線
```

本文は `.ai/` だけを編集する。`.claude/skills`、`.agents/skills`、`.claude/agents` は発見用のシンボリックリンクであり、本文を複製・直接編集しない。Codexエージェントの詳細指示は `.ai/agents/*.md` に置き、`.codex/agents/*.toml` から参照する。

## フック

フックは処理本体とランタイム固有の配線を分離する。Claude/Codexのペイロードやツール名は共有しない。

| 意図 | 共通処理 | Claude配線 | Codex配線 |
| --- | --- | --- | --- |
| 先送りコメントの阻止 | `.ai/hooks/block-deferred-markers.sh` | `Edit` / `Write` の事前hook | `apply_patch` の事前hook |
| 編集後の整形 | `.ai/hooks/format-changed-file.sh` | `Edit` / `Write` の事後hook | `apply_patch` の事後hook |
| スキル利用ログ | `.ai/hooks/log-skill-usage.sh` | `Skill` の開始・完了hook | 明示指定の検出hook + 各スキルの開始・完了記録 |

Codexのプロジェクトローカルhooksは、プロジェクトを信頼した場合だけ実行される。信頼確認を迂回するオプションは通常使わない。

### 共通スキルログ

ローカル利用ログは `.ai/logs/skill-usage.jsonl`（gitignore対象）に JSONL で記録する。

- `requested`: ユーザーが明示的にスキルを指定したことを検出できた。
- `started`: スキルが開始された。
- `completed`: スキルが完了した。

Claude Code は `Skill` hook が `started` / `completed` を自動記録する。Codexにはスキル起動イベントがないため、`requested` は `UserPromptSubmit` hook、`started` / `completed` は各 `SKILL.md` に定めた共通スクリプト呼び出しで記録する。このため、監査では `completed` があるものを実行確認済み、`requested` のみを未確認として扱う。

## 生成と検証

`.ai/hooks/hooks-source.json` はフックの中立的な意図を定義する。`scripts/sync-agent-config.mjs` がこの定義から、既存のClaude権限を温存した `.claude/settings.json` の `hooks` と `.codex/hooks.json` を生成する。

```bash
pnpm sync:agents          # hook生成物を更新
pnpm sync:agents --check  # 差分だけ確認（CI向け）
pnpm test:hooks           # fixtureでblock・ログ・同期を検証
```

生成物とアダプターを変更した場合は、上記2つの検証を実行する。`skill-audit` はリンク、Codexエージェント設定、フック、共通ログをまとめて確認する。

## ランタイム差分

- Claude固有の `settings.json` の allow / deny は Codexの権限を変更しない。Codexはセッションの sandbox・approval と `AGENTS.md` に従う。
- ClaudeのパスベースRulesはCodexへ自動適用されない。共通で必要な規約は `AGENTS.md` または `.ai/runtime-compatibility.md` に置く。
- Claudeの `model` / `tools` はCodexのモデル・sandboxへ転記しない。Codexのモデル方針は `AGENTS.md` と `.codex/agents/*.toml` に明示する。
