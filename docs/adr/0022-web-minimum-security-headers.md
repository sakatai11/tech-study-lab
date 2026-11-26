# 0022: Web Worker のすべての応答に、最低限のセキュリティヘッダを next.config で付ける

- 状態: Accepted
- 日付: 2026-11-26
- 関連: Issue #325

## 背景

2026-11-26 のセキュリティ監査で、Web の応答にセキュリティヘッダがないと指摘された。他サイトの iframe への埋め込み（クリックジャッキング）、MIME スニッフィング、他サイトへの Referer の送信を制御できない。

付け方の選択肢は3つあった。

- Cloudflare 静的アセットの `_headers`: 静的な枠の HTML / RSC は、ADR-0019 の構成で Web Worker が内部 cache artifact から返す。`_headers` は Worker の応答に適用されないため、HTML に届かない。
- middleware / proxy: 全リクエストで追加の処理が走る。静的な枠の配信の CPU 時間を測っている構成（ADR-0020）で、固定のヘッダのためだけに実行段を増やす理由がない。
- `next.config` の `headers()`: Vinext が静的な枠（`x-vinext-cache: HIT`）・SSR・404 の応答へ同じ規則を適用する。設定だけで済み、テストで規則を検証できる。

## 決定

1. Web Worker が返すすべての応答に、`next.config` の `headers()` で次のヘッダを付ける。
   - `Content-Security-Policy: frame-ancestors 'none'` と、これを解釈しないブラウザ向けの `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
2. 規則の `source` は `/` を含む全パスに一致させる。Vinext の `/:path*` は Next.js と違って `/` に一致しないため、`/(.*)` を使う。
3. 静的な枠と SSR（404）の実際の応答にヘッダが付くことを、ビルド後の実行時検証で確かめる。

## 境界

- 対象は Web Worker を通る応答（静的な枠の HTML / RSC、SSR、404）。Worker を通らずに静的アセットから直接返る `/_next/static/*` などのファイルは対象外とする。
- `script-src` などでスクリプトの実行を制限する CSP は含めない。インラインのテーマスクリプトに nonce か hash が必要になるため、別の判断として扱う。CSP を拡張するときは、`frame-ancestors 'none'` を残す。
- HSTS は付けない。HTTPS の強制と HSTS は Cloudflare のゾーン設定が持ち、Worker 側で重ねると設定の所在が二重になる。
- API Worker の応答ヘッダは対象外とする。

## 検証

- [cloudflare-config.test.ts](../../apps/web/scripts/cloudflare-config.test.ts): `next.config` の規則が、Vinext の照合規則で `/` を含む全パスに3種類のヘッダを付け、スクリプト制限の CSP と HSTS を含まないことを検証する。
- [verify-ssg.ts](../../apps/web/scripts/verify-ssg.ts): ビルドして起動した Web Worker で、静的な枠の HTML / RSC と SSR の 404 の応答にヘッダが付くことを確認する（ADR-0022、`pnpm --filter @tsl/web verify:ssg`）。
