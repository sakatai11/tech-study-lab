# Cache Components / PPR 検証記録

この文書は2026-07-28のIssue #93で行った検証の履歴であり、現在の動作保証や実装状況を表さない。以下は旧 `docs/design.md` §12.8から移した記録で、今回再実行した結果ではない。現在の設計契約は [design.md §8.3](../design.md#83-server--client-コンポーネント境界)、実行確認の条件は同書 §12.8を参照する。外部Issueの現在の状態はこの記録では保証しない。

#### 検証結果（2026-07-28・issue #93）

`@opennextjs/cloudflare` の以下の upstream issue は、**本リポジトリの構成では再現しなかった**。

- `opennextjs/opennextjs-cloudflare#1130`：`cacheComponents` 有効時の production-only `SyntaxError`／クラッシュと Suspense 描画失敗。
- `opennextjs/opennextjs-cloudflare#1225`：Suspense streaming が完了せず `Connection closed` になる問題。

`opennextjs-cloudflare build` と `preview`（Service Binding 接続あり）で `/review` を検証し、次を確認した。

- 静的シェルに fallback を含む HTML が返り、解決済みコンテンツが `<div hidden id="S:n">` として後続で届き、`$RC()` で差し替わる（PPR streaming が成立）。
- ブラウザで hydration が完了し、console エラーなし。intro → 出題 → 採点 → 解説まで操作できる。
- 解答して SRS 状態が更新された後に `/review` を再取得すると動的領域が `0 due` へ変わる。**動的領域はリクエストごとに再実行され、ユーザー固有データが共有キャッシュに乗らない。**
- `next build` は API 未設定でも通り、build 時に API を呼ばない。
- 検証したバージョン組は `next@16.2.9` + `@opennextjs/cloudflare@1.19.11`（採用）と `next@16.2.12` + `@opennextjs/cloudflare@1.20.2`（比較）。どちらも同じ PPR 構造を出力した。ブラウザ検証は採用側でのみ実施した。
