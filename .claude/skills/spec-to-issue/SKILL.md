---
name: spec-to-issue
description: 会話やメモの粗い仕様を、受け入れ条件付きの構造化された GitHub issue に整形して登録するスキル。「これをissueにして」「仕様を登録して」/spec-to-issue で起動。登録後は /issue-dev-orchestrate でそのまま実装パイプラインに乗せられる。
argument-hint: [仕様の概要（省略時は直前の会話から抽出）]
---

# 仕様 → GitHub issue 登録

入力は引数のテキスト、または直前の会話で議論された仕様。どちらもなければユーザーに仕様を尋ねて停止する。

## 手順

### 1. 仕様の構造化

入力を以下に整理する。曖昧な点は**勝手に補完せず**、実装を左右する場合は AskUserQuestion で確認する:

- **目的・背景**: なぜ必要か（ユーザー視点の価値）
- **受け入れ条件**: 検証可能なチェックリスト形式（`- [ ]`）。これが実装・テストのゴールになるため、具体的に書く
- **影響範囲**: apps/web / apps/api / packages/shared / content/ / docs/design.md から該当を選ぶ
- **design.md 該当節**: `grep -n "キーワード" docs/design.md` で該当節を特定する。設計にない新規仕様なら「新規（design.md 更新が必要）」と明記
- **スコープ外**: やらないことを明示（CLAUDE.md の「やらないこと」と重複する要求は除外）

### 2. issue 草案の提示

`.github/ISSUE_TEMPLATE/feature-spec.yml` の構成（目的・背景 / 受け入れ条件 / 影響範囲 / design.md 該当節 / 補足・制約）に沿った issue 本文を組み立て、**タイトルと本文全文をユーザーに提示して承認を得る**。実装モード（sonnet / codex）の希望もこのとき確認する。

### 3. 登録

承認後に登録する:

```bash
gh issue create --title "[Feature] <タイトル>" --label spec --body "<本文>"
# codex モード希望なら --label "impl:codex" を追加
```

### 4. 完了報告

issue 番号と URL を報告し、次のアクションを案内する:

> `/issue-dev-orchestrate <番号>` で実装パイプラインを開始できます。

## 注意

- 1 issue = 1 つの縦切り機能（教材→出題→解答記録→SRS の Walking Skeleton パターン）に収める。大きすぎる仕様は分割を提案する。
- 受け入れ条件に「typecheck / biome / test が通る」のような常設ゲートは書かない（パイプラインが常に実施するため）。機能固有の条件だけを書く。
