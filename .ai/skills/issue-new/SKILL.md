---
name: issue-new
description: 会話やメモの粗い仕様・タスクを、構造化された GitHub issue に整形して登録するスキル。機能仕様（feature）だけでなく、開発中に発生したバグ修正・リファクタ・ドキュメント・テスト・雑務（task）も登録できる。「これをissueにして」「仕様を登録して」「バグをissueにして」/issue-new で起動。登録後は /issue-dev-orchestrate でそのまま実装パイプラインに乗せられる。
---

# 仕様・タスク → GitHub issue 登録

実行前に `.ai/runtime-compatibility.md` を全文読み、ユーザー確認方法を現在のランタイムに合わせる。

Codexでは開始直後と完了直前に `./.ai/hooks/log-skill-usage.sh --runtime codex --skill issue-new --status started|completed` を実行して共通ログへ記録する（Claudeではhookが自動記録する）。

入力は引数のテキスト、または直前の会話で議論された仕様・タスク。どちらもなければユーザーに内容を尋ねて停止する。

## 手順

### 1. 種別の分類

入力を以下のいずれかに分類する。判断に迷う場合のみ、利用可能なユーザー確認機能で確認する:

| 種別 | 使う場面 | タイトル接頭辞 | ラベル |
|---|---|---|---|
| `feature` | 新機能・機能拡張（design.md に紐づく仕様） | `[Feature]` | `spec` |
| `bug` | 既存挙動の不具合 | `[Bug]` | `bug` |
| `refactor` | 挙動を変えない内部改善 | `[Refactor]` | `refactor` |
| `docs` | ドキュメントのみ（design.md 更新など） | `[Docs]` | `documentation` |
| `test` | テスト追加・修正のみ | `[Test]` | `test` |
| `chore` | ビルド・CI・設定・依存などの雑務 | `[Chore]` | `chore` |

この種別は `/issue-dev-orchestrate` フェーズ0 のブランチ種別判定（Conventional Branch）にそのまま対応する。

### 2. 内容の構造化

曖昧な点は**勝手に補完せず**、実装を左右する場合は利用可能なユーザー確認機能で確認する。

**feature の場合**（`.github/ISSUE_TEMPLATE/feature-spec.yml` の構成）:

- **目的・背景**: なぜ必要か（ユーザー視点の価値）
- **受け入れ条件**: 検証可能なチェックリスト形式（`- [ ]`）。これが実装・テストのゴールになるため、具体的に書く
- **影響範囲**: apps/web / apps/api / packages/shared / content/ / docs/design.md から該当を選ぶ
- **design.md 該当節**: `grep -n "キーワード" docs/design.md` で該当節を特定する。設計にない新規仕様なら「新規（design.md 更新が必要）」と明記
- **スコープ外**: やらないことを明示（AGENTS.md の「やらないこと」と重複する要求は除外）

**feature 以外の場合**（`.github/ISSUE_TEMPLATE/task.yml` の構成）:

- **背景・現状**: なぜこのタスクが必要か。bug の場合は「再現手順 / 期待する動作 / 実際の動作」を必ず含める（エラーメッセージ・ログがあれば添付）
- **完了条件**: 検証可能なチェックリスト形式（`- [ ]`）
- **影響範囲**: apps/web / apps/api / packages/shared / content/ / docs/design.md / .github/・CI・設定 から該当を選ぶ
- **design.md 該当節**: 設計に関わる場合のみ記載（任意）。挙動が設計と乖離しているのが bug の原因なら明記する
- **補足・制約**: 関連 issue・PR、参考リンク、スコープ外など

### 3. issue 草案の提示

タイトル（接頭辞付き）と本文全文を組み立て、**ユーザーに提示して承認を得る**。バックグラウンドAIエージェントCLIが必要な場合だけ、その理由・担当範囲・想定CLIを補足に含める。

### 4. 登録

承認後に登録する:

`gh auth status` で認証を確認してから、認証済みの `gh` CLI でIssueを作成し、ラベルを設定する。本文は安全な一時ファイルに書き出して `--body-file` で渡す。Codex AppでGitHubコネクタが接続済みの場合は、同等の操作にコネクタを使ってよい:

```bash
gh issue create --title "<接頭辞> <タイトル>" --label <種別のラベル> --body-file <Issue本文を保存した一時ファイル>
```

ラベルが存在しない場合は、同じ実行環境で先に作成する（例: `gh label create <名前> --description "<説明>"`）。

### 5. 完了報告

issue 番号と URL を報告し、次のアクションを案内する:

> `/issue-dev-orchestrate <番号>` で実装パイプラインを開始できます。

## 注意

- 1 issue = 1 つの縦切り機能（教材→出題→解答記録→SRS の Walking Skeleton パターン）または 1 つの独立したタスクに収める。大きすぎる場合は分割を提案する。
- 受け入れ条件・完了条件に「typecheck / biome / test が通る」のような常設ゲートは書かない（パイプラインが常に実施するため）。機能・タスク固有の条件だけを書く。
- bug は再現手順が書けない場合、先に再現確認を提案する（再現しない bug issue は実装パイプラインで手戻りになる）。
