# Jevによる設計参照チェックのPoC（Issue #255）

2026-10-17（JST）。判定は**改善して再評価**。ローカルで固定24組と実文書への実API評価を実施した。暫定ラベルとの一致は23/24組だったが、人による正解確認と時間比較は未実施のため、運用への採用判断は保留する。Issue #255は完了扱いにしない。

## 対象と構成

参照元は明示指定した `AGENTS.md`・`.ai/review-guidelines.md`・`.ai/rules/*.md`。対象は `docs/design.md` の章と `docs/adr/` のADR。パス・章番号・anchorの解決はコードで行い、解決した主張と参照先の意味だけをChoiceで判定する。既存の存在検査は保持する。アプリの実行経路や設計契約は変えない（ADR-0001の境界内）。Graph用のTOMLパーサーも変更しない。

- 実装: `scripts/check-design-references.mjs`、`scripts/design-references.mjs`
- モデル: `jev-1.13.0`（可変aliasを使わない）
- 質問: `design-reference-v1`。質問本文・4分類のcriteriaは1か所に定義し、JSONにもハッシュを記録する。
- 判定: `supports` / `contradicts` / `not_addressed` / `insufficient_context`
- 出力: 出典ファイル・行・原文・前後文、参照先・抜粋、確率、confidence、usage、時間、入力ハッシュ。自動修正・自動承認は行わない。
- 文脈は1組ごとに異なるため要求を分け、順次実行する。同じ状態への独立質問を無意味に複数要求へ分割しない。

## 固定評価データ

`scripts/fixtures/design-reference-evaluation.json` に24組、各分類6組を事前に用意した。採点、userId、SRS、教材の一次ソース、契約管理、Server loaderを題材にする。実際の文書を変えず、fixtureで主張を反転、存在する別の参照先へ差し替え、抜粋を不足させる。抜粋の元は `e0eefbade31fbcfe33faa6b12b2e743880fd7230`。ラベルは実API実行前の暫定値であり、人による正解確認は未実施。

評価時に期待ラベル・ラベル理由をAPIへ送らない。`datasetHash` と `questionHash` を記録して比較条件を固定する。質問や抜粋を調整した場合は同じ評価と混同せず、新しい版で再評価する。24組は小さな動作検証用セットで、独立したholdout評価ではない。

## 現在の結果

| 項目 | 結果 |
| --- | --- |
| APIなしの抽出 | AGENTS.md、review-guidelines、web/sharedルールから44対応を抽出。13件が意味判定候補、31件が文書単位リンク・案内表などの要確認 |
| 日本語評価fixture | 24組を読み込み、APIなしで全件 `not_run: dry_run` として記録 |
| 実API判定 | `jev-1.13.0` / `design-reference-v1`。2026-10-17 23:57:54 JSTの評価JSONで24/24組の判定成功、coverage 100%。通信失敗・不正応答なし |
| 暫定ラベルとの一致・誤支持・支持の見逃し | 23/24組（95.83%）。誤支持0/18組、支持の見逃し0/6組。人による正解確認前の一致率であり、検証済み正解率とは扱わない |
| トークン数・実API時間・費用 | 24要求、入力29,217 tokens、出力1,318 tokens、合計5.0376秒、usageによる推定USD 0.001227114。失敗要求なし |
| 実文書への適用 | 同じ4文書の44対応中13件を判定（支持12・言及なし1）、31件は案内等の要確認。入力32,925 tokens、出力691 tokens、3.0824秒、推定USD 0.00138285 |
| 人手確認時間との比較 | 未測定。直接確認とJev結果の全件確認を人が計測する必要がある |

費用は[公式モデル表](https://docs.typesafe.ai/models)の2026-10-17時点の入力100万tokensあたりUSD 0.042、出力無料を使い、応答のusageから計算する。失敗要求の課金は不明なので、失敗を含むJSONでは `costComplete: false` とし、既知usageだけの見積りとする。残高請求明細の代替にはしない。

### 再現条件と混同行列

評価時のコードは `529dc1c92e72d965618a4506498bcedac59a128d`、Node 24.2.0、pnpm 9.15.0、macOS。キーはユーザーが許可した既存の `.env.local` をNodeの標準機能で読み込み、内容を表示・転記せず実行した。評価後に変更したのはテストfixtureと本記録だけで、モデル・質問・評価データは変更していない。

```text
datasetHash: 9e6efa9f2d983bc6083a4d5913ecbae1aab6c7427904d00e2dec657c359a0f2d
questionHash: 3260779a94f2b512fefc281edb9ae45353a57790d10cfe65098f5fb5a805d8b7
resultsHash: 5cc6fee70e317dad609b2e4106875b63047ee38c2c3631037975b32dad79b416
```

行は事前の暫定ラベル、列はJevの判定。各分類6組である。

| 暫定ラベル / 判定 | supports | contradicts | not_addressed | insufficient_context |
| --- | --- | --- | --- | --- |
| supports | 6 | 0 | 0 | 0 |
| contradicts | 0 | 6 | 0 | 0 |
| not_addressed | 0 | 0 | 6 | 0 |
| insufficient_context | 0 | 0 | 1 | 5 |

不一致は `content-insufficient_context` の1組。指示語だけの主張と途中で切ったADR-0006の抜粋について、暫定ラベル `insufficient_context` に対して `not_addressed` となった。確率は支持0.09・矛盾0.02・言及なし0.54・文脈不足0.35、confidence 0.39。質問や正解候補を結果に合わせて変更せず、人が境界を確認する対象に残す。confidenceの閾値は未校正であり、この1件に合わせて閾値を決めない。

実文書では `.ai/rules/shared.md` の10行目からdesign.mdの5.2節への参照が `not_addressed`（確率0.68、confidence 0.57）になった。同じ行が5.1節と5.2節をまとめて参照しているため、主張の帰属と参照先の範囲を人が確認する候補とする。この判定からルールを自動修正せず、実文書の誤検出率も正解ラベルなしでは計算しない。

2回の実行は合計37要求、入力62,142 tokens、出力2,009 tokens、API処理8.1200秒、推定USD 0.002609964。待ち時間、正解ラベルの検証、人手の確認時間は含まない。生の評価JSONはローカルの成果物として保存し、各行の入力・確率・時間を確認できる。

### ローカル検証での修正

`pnpm design-ref:test` と、それを呼ぶ `pnpm test` はmacOSで同じ1件が失敗した。再現箇所は `scripts/design-references.test.mjs` の外部symlink検査で、Linuxの `/etc/hostname` をリンク先に固定していたため、macOSでは `ENOENT` が境界拒否より先に発生した。fixture root外にテスト自身が一時ファイルを作成する形へ変更し、境界拒否のassertionを維持したまま14/14件の成功を確認した。システムファイルの存在に依存しない。

## 確認できた境界と限界

キー未設定・参照切れ・予算超過・通信失敗・不正なChoiceを支持判定に変換しない。送信元は許可したポリシーファイルに限定し、リポジトリ外へのsymlinkも拒否する。クラウドのHTTP(S)プロキシ・NO_PROXY・CA trustを維持するため `undici` の `EnvHttpProxyAgent` を使う。Node 22.13以上を維持する。

抽出はリポジトリの限定Markdown書式が対象であり、任意のMarkdown構文は扱わない。主張は出典1行と前後1行を渡すため、複数行にまたがる条件や複数参照の帰属は曖昧になりうる。案内表を要確認にするので、読む文書の対応表そのものを自動的に保証する用途には使えない。大きな章は予算超過で未実行にし、本文を黙って落とさない。今回の24組は日本語の小規模な暫定評価であり、一般的な日本語精度やconfidenceの校正は検証できていない。

## 再開条件

1. ローカルで実API評価と実文書のチェックは実施済み。キー設定や通信許可を理由とする停止条件は解消した。
2. 人が暫定ラベルを確認し、同じ24組の直接確認・Jev結果の確認時間を計測する。保存した結果のhashを指定したオフライン比較を行う。AIの処理時間では代用しない。同じ人で直接確認を先に行う場合は、学習・順序効果を記録する。
3. 人がラベルを修正した場合は、現状の暫定ラベルによる23/24組の集計を履歴として保ち、修正後の指標を別に集計する。
4. 人手比較と必要なレビューを記録して採用・改善・不採用を判断する。人手比較がない間は「改善して再評価」を維持する。誤支持0件は18組の暫定評価の結果であり、自動承認の根拠にはしない。

参照: [TypeSafe公式スキル](../../.ai/skills/typesafe-ai/SKILL.md)、[HTTP API](https://docs.typesafe.ai/api)、[Choice](https://docs.typesafe.ai/primitives/choice)、[Citation cookbook](https://docs.typesafe.ai/cookbooks/citation_check)。
