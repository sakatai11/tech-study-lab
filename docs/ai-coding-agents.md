# AIコーディングエージェント連携仕様

## 1. 目的と適用範囲

この仕様書は、**tech-study-lab** で利用するAIコーディングエージェントの設定、共通資産、実行時の差分、検証方法を定義する。対象は Claude Code と Codex App / CLI である。

アプリケーションの設計契約の一次ソースは [ADR](./adr/README.md)、層と依存方向は [`design.md`](./design.md)。本書はAI開発ハーネスの仕様であり、アプリケーション要件を定義しない。

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
└── runtime-compatibility.md        # Claude/Codexの実行差分（GitHub認証、サブエージェント、別モデルCLI）

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

スキル本文は特定製品のツール名に依存しない。進捗管理、ユーザー確認、バックグラウンド実行、ブラウザ確認は、各ランタイムに備わる同等機能で実施する（`.ai/runtime-compatibility.md` の「ランタイム差分の原則」）。スキルは同ファイルを全文読まず、必要な節だけを参照する。

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

hookの生成物（`.claude/settings.json` の `hooks`、`.codex/hooks.json`）は相互にsymlinkせず、`pnpm sync:agents` で生成する。

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

1. **hookの動作検証**: Claude/Codexの代表入力fixtureを使い、TODO検出、Codexの明示スキル指定、Claude/Codexのライフサイクルログ、Codexの編集後整形アダプター、`pnpm sync:agents --check` による生成物の同期を確認する。別モデル CLI レビューで最新の Sol を選ぶスクリプト（`.ai/scripts/latest-codex-model.mjs`）の選択ロジックも検証する。
2. **両ランタイムの構成整合**: `.ai/skills/*`・`.ai/agents/*.md`・`.ai/rules/*.md` ごとに `.claude/` と `.agents/` の発見用リンクがあり `.ai/` を指すこと、取り残しのリンクがないこと、`.ai/agents/<name>.md` と `.codex/agents/<name>.toml` が1対1で `name` が一致すること、パス別ルールが `AGENTS.md` から参照されていること、権限・Sandboxの迂回フラグがハーネスに含まれないことを確認する。
3. **weekly-retro レンダラーの出力検証**と、**`docs/design.md` の章参照の解決検査**（`scripts/test-design-chapter-refs.mjs`）、**ADR の書式・検証テストとの対応・`ADR-NNNN` 参照の解決検査**（`scripts/test-adr-refs.mjs`）。

契約文書の**文言**は検査しない。文言が存在してもモデルがそれに従う保証にはならず、改善のたびに期待値の更新を強いるためである。文書の内容はレビューで確認する。

このゲートは `.github/workflows/ci.yml` のPR CI（`jq` を含む依存の存在確認つき）で実行され、失敗するとジョブが落ちる。実行時間は約1秒である。実際のCodex App / CLIが外部サービスへ接続してhookを発火する統合テストは、信頼済み環境で別途実施する。

### 7.1 Jevによる設計参照の意味チェック

Codex／Claude Codeは共通の `pnpm design-ref:review` を使う。AIによる実行可否・送信同意・判定結果の扱いは [レビュー規約](../.ai/review-guidelines.md#jev設計参照チェック) が定義する。

```sh
# レビュー対象をコミット後、送信候補をオフラインで確認する
pnpm --silent design-ref:review --base <baseCommit> --head <headCommit> --dry-run

# 送信許可を確認した候補のplanHashで実行する
pnpm --silent design-ref:review --base <baseCommit> --head <headCommit> --execute --approved-plan <planHash>
```

`--dry-run` が既定。対象は変更されたポリシーと、変更された設計文書・ADRを参照するポリシーである。参照先は文書単位で判定し、選んだ参照元の全参照を候補にする。削除・改名で未解決になった参照も残る。`planHash` はcommit・候補の本文と出典・送信条件・checkoutに対応し、実行時に再収集した内容との一致を検査する。参照元・参照先の作業コピーとheadの不一致、許可外の実パスは送信前に拒否される。

両CLIはプロセス環境の `TYPESAFE_API_KEY` を継承し、`.env.local` は自動読み込みしない。ローカルではユーザーが設定済みのシェル、クラウドではsecret bindingを使う。クラウドの接続先はHTTPSの `api.typesafe.ai` で、継承したproxy・CAを使う。

モデルは `jev-1.13.0`、質問版は `design-reference-v1`。既定30要求、`--max-requests 1..100`、1要求30秒・JSON本文24,000 bytes以内で、抜粋の切り詰め・自動リトライは行わない。最初のAPIエラーで後続送信を止める。JSONには出典・抜粋・判定・確率・confidence・usage・所要時間・入力ハッシュ、レビュー用の `findings` が入る。

| 状態・理由 | 対処・確認先 |
| --- | --- |
| `no_affected_sources` / `no_references_in_selected_sources` | 対象外。削除した参照元は `deletedSources` に残る |
| `approval_required` / `approved_plan_mismatch` | 許可範囲とdry-runを再確認 |
| `review_context_dirty` / パス拒否 | 対象head・作業コピー・実パスを確認 |
| 引数エラー（`unknown_option` など） / `git_failed` | 引数の誤りとGitの失敗を区別。後者は参照commitの取得状況・リポジトリを確認 |
| `dependency_missing` | `pnpm install --frozen-lockfile` で依存を導入。dry-runは依存なしでも可能 |
| `missing_api_key` | 起動前の環境変数設定を確認 |
| `network_error` / `request_timeout` | proxy・CA・許可ホスト・通信状態を確認 |
| `http_<status>` | API側の認証・制限・障害を確認 |
| `invalid_json` / `invalid_response` | 応答形式不正。判定は取得できていない |
| `request_budget_exhausted` / `context_budget_exceeded` | 要求／文脈予算超過。上限変更には同意範囲の確認が必要 |
| `stopped_after_error` | 先行エラーで後続を未実施 |
| `local_error` / `needs_confirmation` | 未解決参照、案内表・コード例・文書全体参照など。API送信せずローカルで確認 |

終了コードは対象外・dry-run・実行完了が0、未承認・未実施・APIエラー・未解決参照が2。`completed` でも `needs_confirmation` は未送信で残る。対応するMarkdownはリポジトリのATX見出し、インラインリンク、章番号・ADR番号に限定される。

通常の「このPRをレビューして」という依頼では、AIがdry-runを読み、送信許可がなければ「未承認のため未実施」と通常レビューの結果に記載する。今回の候補を覆う事前許可があれば実行し、出典・判定・元文書の確認結果を報告する。

手動調査と固定fixtureの評価には直接指定CLIを使う。実行結果はGit対象外の `reports/` に保存できる。

```sh
pnpm --silent design-ref:check --dry-run .ai/rules/web.md .ai/rules/shared.md

# 以下は外部送信の許可がある場合だけ実行する
mkdir -p reports
pnpm --silent design-ref:check .ai/rules/web.md .ai/rules/shared.md > reports/design-references.json
pnpm --silent design-ref:check --evaluate > reports/jev-evaluation.json
```

`pnpm design-ref:test` は [Git fixture・mock transportによるrunnerの検証](../scripts/review-design-references.test.mjs) と [参照抽出・固定評価の検証](../scripts/design-references.test.mjs) を実行する。両ランタイムの配線は `pnpm test:hooks` で確認する。共通コマンドの検証は実モデルのE2E試験ではない。

人手との比較では、同じ24組の直接確認とJev結果を用いた確認の時間を秒で測る。評価JSONの `datasetHash`・`resultsHash`、`cases: 24`、`reviewer`、ISO日時の `measuredAt`、実測した `baselineSeconds`・`assistedReviewSeconds` を `reports/jev-human-timing.json` に保存すると、APIを再実行せず比較できる。

```sh
pnpm --silent design-ref:check --compare reports/jev-evaluation.json --human-timing reports/jev-human-timing.json
```

評価の現状と限界は [調査記録](./investigations/2026-10-17-jev-design-reference-check.md) に残す。

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

リンク・TOML・パス別ルールの参照・迂回フラグなど、機械的に判定できる構成は `pnpm test:hooks` が CI で検査する。`skill-audit` は、その結果に加えて、参照の実在・絶対パス・権限の衝突・記述と実態の乖離など判断が必要な監査と、ローカルスキルログによる棚卸しを行う。AIハーネスを大きく変更した後や、定期的な棚卸しのときに実行する。
