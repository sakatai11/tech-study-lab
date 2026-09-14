---
name: content-quality-gate
description: content/ 配下の教材・問題を、共有スキーマによる機械検証と本文・設問の内容レビューで検証する読み取り専用ゲート。教材の追加・改訂後や「教材を検証して」「問題の品質を確認して」で使用する。一般的なtypecheck・lint・test・buildは対象外。
---

# コンテンツ品質ゲート

教材・問題の一次ソースである `content/` を変更せず、機械検証と内容レビューの結果を報告する。一般的なリポジトリ品質ゲートやアプリの動作確認は、このスキルでは実行しない。

## 一次ソース

- 物理配置、ID、問題数などの規約: `docs/design.md` §11
- frontmatter と問題の構造: `packages/shared/src/schema/content.ts`
- パス整合とID一意性: `packages/shared/src/content-parser.ts`

フィールドや件数の制約をこのスキルへ複製せず、実行時点の一次ソースを参照する。

## 対象の決定

ユーザーまたは呼び出し元から対象パスが渡された場合は、その教材と同じトピックの `index.md` を確認する。対象指定がなければ、作業ツリーと現在の比較範囲に含まれる `content/` の変更を対象とする。全件監査を明示された場合だけ `content/` 全体を内容レビューする。

対象となる変更がない場合も、機械検証だけを全contentに対して実行し、内容レビューが対象なしだったことを報告する。

## 機械検証

次の副作用のないcheckコマンドを実行する。

```bash
pnpm --filter @tsl/api content:check
pnpm --filter @tsl/web content:check
```

両コマンドは `packages/shared` のcontent Zodと `createContentBundle` を通じて、少なくとも次を検証する。

- topic・lesson・questionのfrontmatter
- 選択肢と `answerIndex`
- explanationの必須性
- パス、domain、topic、lessonIdの対応
- lessonIdとquestionIdの形式・対応・一意性

検証のために `content:sync` や `content:sync:remote` を実行しない。これらはD1を変更する同期処理であり、この読み取り専用ゲートの責務外である。

コマンドが失敗した場合は、失敗したコマンド、終了状態、該当ファイルとエラー要旨を記録する。修正や生成コマンドへの切り替えは、呼び出し元またはユーザーの指示なしに行わない。

## 内容レビュー

対象となるlesson Markdownについて、本文、各設問、選択肢、正解、explanationを一組として確認する。

- 問題が本文の学習内容から解ける
- 正解が技術的に正しく、複数の選択肢が正解にならない
- 誤答が不自然な穴埋めではなく、理解の差を確認できる
- explanationが正解理由を説明し、必要に応じて主要な誤答理由にも触れる
- 問題群が定義・原因・具体例・対策・落とし穴など、レッスンの主要観点を適切にカバーする
- topicの概要、lesson本文、問題の対象範囲が矛盾しない

機械判定できない技術的正確性や本文との対応は、目視レビューの根拠とともに報告する。判断に外部資料が必要な場合は、未確認のまま合格にせず、必要な確認事項として残す。

## 判定と報告

結果は次の形式で返す。

```text
verdict: pass | fail | incomplete
scope: 確認したcontentパス
mechanical_checks: コマンドごとのpass/fail/not-run
content_review: must-fix / should-fix / nit の指摘
unverified: 未確認項目と理由
```

- `pass`: 両方の機械検証が成功し、内容レビューにmust-fix・should-fixがない
- `fail`: 機械検証が失敗した、またはmust-fix・should-fixがある
- `incomplete`: 必要なコマンドまたは内容レビューを実行できていない

指摘には対象ファイル、問題、根拠、修正案を含める。対象なし、未実行、実行失敗を合格として扱わない。

このスキルは読み取り専用である。教材の修正、D1同期、commit、push、Issue・PR操作は行わない。
