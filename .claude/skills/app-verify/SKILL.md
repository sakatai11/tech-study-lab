---
name: app-verify
description: dev サーバー（api :8787 / web :3000）を起動し、縦切り（教材表示→出題→解答記録→SRS）が実際に動くことを end-to-end で確認する手順。実装完了後の動作確認、「動くか確認して」「アプリを起動して」で使用。テストが通っても実際に動かないケースを検出する。
argument-hint: "[確認対象の機能（省略時は縦切り全体）]"
---

# アプリ動作確認（縦切り検証）

design.md §12.3 のローカル開発手順に基づく。確認対象は引数で指定された機能、なければ Walking Skeleton の縦切り全体。

## 手順

### 1. 前提の確認・準備

```bash
git status --porcelain                        # 作業状態の把握（変更はそのまま検証対象）
pnpm --filter @tsl/api db:migrate:local       # スキーマ変更があった場合
pnpm content:sync                             # content 変更があった場合（未実装ならスキップし報告）
lsof -ti:8787,3000                            # ポート占有確認（既存プロセスがあればユーザーに確認）
```

### 2. dev サーバー起動（バックグラウンド）

Bash tool の `run_in_background: true` で起動する:

```bash
pnpm --filter @tsl/api dev    # Hono / wrangler dev → http://localhost:8787
pnpm --filter @tsl/web dev    # Next.js → http://localhost:3000
```

起動ログで listen 開始を確認してから次へ進む（api は D1 バインディング、web は環境変数 `API_BASE_URL=http://localhost:8787` の解決を確認）。

### 3. API 単体の確認

```bash
curl -s http://localhost:8787/ | head -5              # 疎通
# 実装済みエンドポイントを叩く（例）
curl -s http://localhost:8787/api/lessons | head -20
```

- 正常系だけでなく、**Zod バリデーションの拒否（不正入力で 400）** も1つは確認する。
- レスポンスが `packages/shared` の型と一致するかを目視確認する。

### 4. 縦切りの確認（教材→出題→解答記録→SRS）

1. **教材表示**: `curl -s http://localhost:3000/<教材ページ>` で HTML に教材タイトル・本文が含まれること。
2. **出題**: 問題データがページまたは API 経由で取得できること。
3. **解答記録**: 解答 API を POST し、成功レスポンスを確認。直後に D1 を照会してログが入っていること:
   ```bash
   pnpm --filter @tsl/api exec wrangler d1 execute tech-study-lab --local \
     --command "SELECT * FROM answer_logs ORDER BY rowid DESC LIMIT 3;"
   ```
4. **SRS**: 解答後に `srs_states` が更新されていること（同様に D1 照会）。
5. UI の見た目まで確認が必要な場合のみ、Chrome ブラウザツール（claude-in-chrome）で該当ページを開いて操作する。

### 5. 後片付けと報告

- 起動した dev サーバーを停止する（バックグラウンドシェルを kill）。
- 結果を報告する: 確認項目ごとの OK/NG、NG の再現手順とログ、気づいた問題（動作したが仕様と違う等）。

## 原則

- **修正はしない**。このスキルの成果物は検証レポート。問題が見つかったら報告し、修正は /issue-dev-orchestrate の fix フローまたはユーザー指示で行う。
- 確認できなかった項目は「未確認」と正直に報告する（OK と偽らない）。
