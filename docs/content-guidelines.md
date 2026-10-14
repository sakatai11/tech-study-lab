# コンテンツ規約

`content/` 配下の教材・問題を書く・直すときの規約。`content-author` エージェントと `content-new` スキルは、執筆の前に本書と [content schema](../packages/shared/src/schema/content.ts) を読む。content を一次ソースとし D1 をキャッシュにする判断、同期の規則、記録済みの ID を変えない規則は [ADR-0006](./adr/0006-content-as-source-of-truth.md) が持つ。

## コンテンツ階層

```
領域（domain）
└── トピック（topic）       例：XSS, 認証認可, 状態管理
    └── レッスン（lesson）   教材1本 = Markdown
        └── 問題（question） 複数。4択
```

## 問題形式

- 初期は **4択（多肢選択）に統一**。自動採点でき、解答ログが構造化され、SRSが即動く。
- 記述式・コード問題は `question.type` フィールドで**後から追加できる拡張ポイント**として確保する。

## frontmatter の項目

- `domain`: 領域キー（例 `security`）
- `topic`: トピックキー（例 `xss`）
- `lesson`: レッスンID・タイトル・本文（Markdown本体）・`estimatedMinutes`（0より大きい整数。教材閲覧1回あたりの学習時間を分で近似するための値）
- `questions[]`: `{ id, type: 'mcq', prompt, choices[], answerIndex, explanation }`

## ID と URL

- **ID 設計**：`lessonId` / `questionId` は**グローバル一意**。学習導線は階層 URL（`/learn/...`）、演習・復習はフラット URL（`/quiz/[lesson]`・`/review`）。

## ファイル配置

```
content/
├── security/                   # domain（domainKeySchema のキーと一致）
│   └── xss/                    # topic（トピックキー）
│       ├── index.md            # トピックのメタ情報＋概要文
│       └── security-xss-01.md  # レッスン（ファイル名 = lessonId）
```

- ディレクトリ階層は上記のコンテンツ階層（domain > topic > lesson）をそのまま写す。
- **ファイル名 = lessonId**。frontmatter の `domain` / `topic` はディレクトリパスと一致していなければならない。
- パス⇔frontmatter⇔ID の整合は、Web のビルド時パースと `content:sync`（どちらも共通のパーサーを使う）の**両方で検証し、不一致はビルド失敗**にする。AI が教材を追加・改訂する際のガードレール（設計文書 §3）として機能させる。
- 教材追加・改訂時の読み取り専用preflightには `pnpm content:validate` を使う。このコマンドは共有content Zodと共通パーサーで構造・パス・IDを検証し、生成物の更新やD1同期は行わない。

## ID 命名規則

記録済みの ID を変えない規則は [ADR-0006](./adr/0006-content-as-source-of-truth.md) に移した。

| ID | 形式 | 例 |
| --- | --- | --- |
| lessonId | `<domain>-<topic>-<連番2桁>` | `security-xss-01` |
| questionId | `<lessonId>-q<連番>` | `security-xss-01-q1` |

- 使用文字は小文字英数とハイフンのみ（`^[a-z0-9-]+$`）。
- **一度 `answer_logs` / `srs_states` に記録された ID は変更しない（不変）**。ID を変えると学習履歴・SRS 状態が切れる。
- 誤字修正・解説の改善など**意味が変わらない改訂は同一 ID のまま**行う。問題の意味が変わる改訂は**新しい questionId で追加**し、旧問題は content から削除する（D1 側は物理削除しない。ADR-0006）。
- トピック内のレッスン並び順は lessonId の連番で決める（別途 `order` フィールドは持たない。並び替えが必要になった時点で追加を検討）。

## 表示名（ラベル）の持ち場所

キー（`security` / `xss`）は識別子であり、画面表示用の日本語ラベルとは分離する。

| 対象 | 持ち場所 | 理由 |
| --- | --- | --- |
| domain のラベル・並び順 | `packages/shared` の定数マップ（`DOMAIN_LABELS: Record<DomainKey, { label, order }>`） | 4 領域で固定（Zod enum と同じ場所で単一ソース化） |
| topic のラベル・並び順・概要文 | `content/<domain>/<topic>/index.md`（frontmatter: `{ topic, title, order }`、本文: 概要文） | コンテンツと一緒に増えるため content 側で管理。概要文はレッスン一覧ページの説明に使う |
| lesson のタイトル | レッスン frontmatter の `title`（既存どおり） | — |

`DOMAIN_LABELS` の確定値（`order` は表示順で 1 始まり。`domainKeySchema` の enum 宣言順・設計文書 §1 の学習領域の並びと一致させる）:

| domain | label | order |
| --- | --- | --- |
| `security` | セキュリティ | 1 |
| `frontend` | フロントエンド | 2 |
| `backend` | バックエンド | 3 |
| `architecture` | アーキテクチャ | 4 |

topic frontmatter の `order` も同様に表示順（0 以上の整数、小さいほど先）とする。

## スキーマ・検証の参照先

現在の宣言は [content schema](../packages/shared/src/schema/content.ts)、パス・frontmatter・IDの整合検証は [共通parser](../packages/shared/src/content-parser.ts) を参照する。規範は本書に定義し、追加作業や完了状況はIssue / PRで管理する。

## レッスンあたりの問題数

- 本番の教材は **1 レッスンあたり 5〜7 問を目安**とする。定義・原因・具体例・対策・落とし穴など、トピックの主要な観点を一通りカバーしつつ、AI が 1 レッスンを書く際の執筆・レビュー負荷が過大にならない範囲として設定する。
- **Walking Skeleton（[最初のマイルストーンの記録](./investigations/2026-10-14-walking-skeleton-milestone.md)）の「4択3問」は例外**：スタック全体（教材表示 → 採点 → SRS）の疎通確認が目的の最小構成であり、本番教材の目安ではない。Walking Skeleton 貫通後に追加する実際のレッスンは本節の 5〜7 問を基準にする。
- 5〜7 問は初期の目安であり固定値ではない。トピックの複雑さに応じて増減してよい。

