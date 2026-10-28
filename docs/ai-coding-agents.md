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

`pnpm design-ref:check` は、明示指定した `AGENTS.md`・`.ai/review-guidelines.md`・`.ai/rules/*.md` と、設計章・ADRの意味の対応を調べる補助コマンドである。APIキーや通信を必要とするため、CIや編集hookからは実行しない。既存の参照存在チェック、テスト、人間のレビューは引き続き行う。

AIが通常のレビュー依頼から実行要否を判断する運用は [レビュー規約の「Jev設計参照チェック」](../.ai/review-guidelines.md#jev設計参照チェック) を単一ソースとする。`AGENTS.md` が通常のCodex／Claude Codeレビューを案内し、共通の `.ai/agents/reviewer.md` と開発スキルも同じ規約を参照する。API担当を1人にし、`designReferenceReview` で結果を共有する。既存の直接指定CLIは手動調査用として残す。

AIによる実行例（レビュー対象を確定・コミット後）:

```sh
# committedRangeのbase（3点差分ならmerge-base）とheadを指定。API・キー不要
pnpm --silent design-ref:review --base <baseCommit> --head <headCommit> --dry-run

# AIがJSONのsources・rows・endpoint・上限を読み、ユーザーの同意範囲を確認した場合だけ
pnpm --silent design-ref:review --base <baseCommit> --head <headCommit> --execute --approved-plan <planHash>
```

`--dry-run` が既定。`planHash` はcommit・選択パス・送信する主張と前後文・参照先抜粋と出典・モデル／質問・上限・checkoutに対応する。候補変更時は再dry-runし、既存の許可で覆えなければ追加確認する。hashを指定できること自体は送信同意にならない。作業コピーがheadと異なると停止するため、レビュー対象と混ざった未コミット文書を送信しない。

例えば「このPRをレビューして」とだけ頼まれた場合、AIは候補のJSONまでは確認し、送信同意がなければ「未承認のため未実施。対象は `.ai/rules/web.md`、参照先は設計章。通常レビューは実施」と報告する。事前許可が今回の候補を覆っていれば再確認せず実行し、`findings` の参照元行・参照先・判定・要確認理由を元文書と照合してレビューへ記載する。キーなし・通信失敗でも「問題なし」にせず理由と未実施件数を報告する。報告へ原文を大量に転載せず、ローカルのJSONは必要ならGit対象外の `reports/` に置く。

手動調査・固定fixtureの評価例（外部送信を伴う2つのコマンドは同意を確認してから）:

```sh
# APIを呼ばず、送信候補・参照先・要確認理由を確認する
pnpm --silent design-ref:check --dry-run .ai/rules/web.md .ai/rules/shared.md

# 指定した文書の主張と参照先の抜粋だけをTypeSafeへ送る
mkdir -p reports
pnpm --silent design-ref:check .ai/rules/web.md .ai/rules/shared.md > reports/design-references.json

# 日本語24組の固定fixtureを評価する
pnpm --silent design-ref:check --evaluate > reports/jev-evaluation.json
pnpm design-ref:test
```

起動前にユーザーが安全な方法で設定した `TYPESAFE_API_KEY` をプロセス環境から継承する。両CLIとも `.env.local` を自動読み込みしない。以前の `design-ref:check` の `--env-file-if-exists=.env.local` は機密ファイルの読み取り許可と衝突するため撤去した。ユーザーが自分でキーをロード済みのシェルから起動するか、クラウド環境に同名のsecretを設定する。AIはキーを表示せず、ファイルの `source` や `--env-file` でdenyを迂回しない。`.env.local` と `reports/` はGit管理しない。キーを引数・Issue・PR・ログに記載しない。クラウドではHTTPSの `api.typesafe.ai` を許可し、継承したproxyとCAを使う。置換されるキーのプレースホルダーもそのまま使う。設定変更前のタスクには反映されない場合があるため、適用済み環境で実行する。

モデルは `jev-1.13.0`、質問は `design-reference-v1` に固定する。JSONには出典行・原文・参照先抜粋、`supports` / `contradicts` / `not_addressed` / `insufficient_context`、各確率・confidence・usage・所要時間・入力ハッシュを記録する。confidenceは分布の集中度であり、正しさの保証ではない。未校正の閾値で自動承認しない。

未解決参照は `local_error`、文書全体へのリンク・案内の表・コード例は理由付きの `needs_confirmation` にする。その他の案内や曖昧な主張もモデルが `insufficient_context` を選べる。キー未設定・文脈予算超過・要求上限は `not_run`、HTTP失敗や不正な応答は `error` として残す。最初のAPIエラーで後続送信を止め、自動リトライしない。上限は1実行30要求、`--max-requests 1..100` で明示変更できる。1要求30秒、JSON本文24,000 bytes以内に制限し、抜粋を黙って切り詰めない。

終了コード0はコマンドの実行完了を示し、意味の正しさを承認しない。矛盾や要確認を含め、必ずJSONを読む。未解決・未実行・APIエラーは終了コード2とする（`--dry-run` 自体による未実行は正常）。対象のMarkdown書式は、既存リポジトリで使うATX見出し、インラインリンク、章番号・ADR番号に限定する。任意のMarkdownや文書全体を網羅する監査ではない。

ローカルの回帰検証は `pnpm design-ref:test` を使う。新しいrunnerは依存の遅延ロードにより、`undici` 未導入でも対象選択・dry-run・キーなしを確認できる。実行の失敗理由と対処はレビュー規約の「起動と失敗時の扱い」を参照する。未承認・失敗・未実施は終了コード2、対象外とdry-runは0（未解決参照があれば2）。意味の判定は終了コードへ変換しない。

| Codex／Claude Code共通入口の代表ケース | fixture・mockでの確認 |
| --- | --- |
| 参照元の変更あり | Git fixtureの変更元だけを選び、主張・前後文と抜粋をdry-runで確認 |
| 通常コードだけの変更 | 選択0件・API要求0件、対象外理由を返す |
| 設計／ADRの参照先だけ変更・削除 | 逆引きした参照元を選び、未解決参照を保持する |
| 未承認・候補変更 | 送信0件、承認不足／hash不一致を返す |
| キーなし・依存未導入 | `.env.local` をロードせず、それぞれ別の未実施理由を返す |
| 通信失敗・API失敗・不正JSON・予算超過 | mock transportで状態を区別し、後続停止・再試行なし・秘密を出力しないことを確認 |
| 矛盾・言及なし・文脈不足 | 出典と手動確認理由をJSONへ対応付け、自動承認しない |

両ランタイムは同じNode入口を使う。テストは一時Gitリポジトリで実際の選択・起動・mock結果処理を実行し、リンク／Codex TOMLの配線は `pnpm test:hooks` で確認する。指示文の文字列一致を動作保証にしない。これはCodex／Claudeのモデルが指示に従うことのE2E試験ではない。実ランタイムでスモーク確認する場合は、上表の差分を用意し、通常の「レビューして」という依頼からdry-run・同意判定・未実施理由／mock結果が報告されることを確認する。実APIによる検証は別途同意がある場合に限る。

人手との比較は、同じ24組を人が直接確認する時間と、Jevの結果を読んで全件確認する時間を秒で測る。順序効果を抑えるため、可能なら別の担当者・順序で測る。正解ラベルも人が確認する。評価JSONの `datasetHash`・`resultsHash`、`cases: 24`、`reviewer`、ISO日時の `measuredAt`、実測した `baselineSeconds`・`assistedReviewSeconds` を `reports/jev-human-timing.json` に保存し、次で既存の結果と比較する。比較処理はAPIを再実行しない。

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
