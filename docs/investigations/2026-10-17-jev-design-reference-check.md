# Jevによる設計参照チェックのPoC（Issue #255）

2026-10-17（JST）。判定は**改善して再評価**。実装とAPI不要の検証まで進めた。実API精度・料金・人手確認時間の実測がないため、運用への採用判断は保留する。Issue #255は完了扱いにしない。

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
| 実API判定 | 未実施。このタスクの環境ではキーの存在と送信先の許可を確認できていない。ユーザーはCodex Cloud側で設定済みと回答 |
| 正解率・誤支持・支持の見逃し | 未測定。0件を正解や誤判定0件の実績として扱わない。評価JSONでは判定coverageを併記し、判定0件のaccuracyはnull |
| トークン数・実API時間・費用 | 未測定 |
| 人手確認時間との比較 | 未測定。直接確認とJev結果の全件確認を人が計測する必要がある |

費用は[公式モデル表](https://docs.typesafe.ai/models)の2026-10-17時点の入力100万tokensあたりUSD 0.042、出力無料を使い、応答のusageから計算する。失敗要求の課金は不明なので、失敗を含むJSONでは `costComplete: false` とし、既知usageだけの見積りとする。残高請求明細の代替にはしない。

## 確認できた境界と限界

キー未設定・参照切れ・予算超過・通信失敗・不正なChoiceを支持判定に変換しない。送信元は許可したポリシーファイルに限定し、リポジトリ外へのsymlinkも拒否する。クラウドのHTTP(S)プロキシ・NO_PROXY・CA trustを維持するため `undici` の `EnvHttpProxyAgent` を使う。Node 22.13以上を維持する。

抽出はリポジトリの限定Markdown書式が対象であり、任意のMarkdown構文は扱わない。主張は出典1行と前後1行を渡すため、複数行にまたがる条件や複数参照の帰属は曖昧になりうる。案内表を要確認にするので、読む文書の対応表そのものを自動的に保証する用途には使えない。大きな章は予算超過で未実行にし、本文を黙って落とさない。日本語の精度とconfidenceの校正は未検証。

## 再開条件

1. 設定済みのCodex Cloud実行環境で、キーの値を表示せず存在と送信許可を確認する。
2. [実行手順](../ai-coding-agents.md)に従い、24組の実API評価と実際のルールのチェックを明示実行する。
3. 人が暫定ラベルを確認し、同じ24組の直接確認・Jev結果の確認時間を計測する。保存した結果のhashを指定したオフライン比較を行う。
4. coverage、混同行列、誤支持・見逃し、総時間、usage・費用、人手時間を本記録へ追記し、採用・改善・不採用を判断する。

参照: [TypeSafe公式スキル](../../.ai/skills/typesafe-ai/SKILL.md)、[HTTP API](https://docs.typesafe.ai/api)、[Choice](https://docs.typesafe.ai/primitives/choice)、[Citation cookbook](https://docs.typesafe.ai/cookbooks/citation_check)。
