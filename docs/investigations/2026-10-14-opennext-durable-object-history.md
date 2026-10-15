# OpenNext 時代の Durable Object 登録の履歴

記録日：2026-10-14。設計文書（`docs/design.md`）の旧 8.3 節にあった経緯を、Issue #242 の縮退に合わせて移した記録である。

## 経緯

Web の build / deploy を OpenNext から Vinext へ移す前、本番 Web Worker `tech-study-lab-web` には、OpenNext の再検証 Queue のための Durable Object（`DOQueueHandler`）を登録していた。Vinext への移行（[Vinext 検証記録](./2026-10-04-vinext-migration.md)、Issue #221）で ISR 用の Incremental Cache と再検証 Queue を使わなくなり、この Durable Object は廃止した。

## 設定に残しているもの

- Cloudflare は Worker に登録した Durable Object の作成・削除の履歴を保持し、以後の deploy でも同じ履歴を要求する。そのため `apps/web/wrangler.jsonc` の top-level には、作成の `v1`（`new_sqlite_classes`）と削除の `v2`（`deleted_classes`）を保持し続ける。
- Wrangler は top-level の `migrations` を env へ継承する。検証用の env（`edge`）は本番の履歴を継承しないよう、空の `migrations` を明示する。
- 本番の deploy は、生成された config に `v1` / `v2` の履歴があることを検査してから Wrangler を起動する（[デプロイ運用](../deployment.md)）。

履歴の保持は `apps/web/scripts/cloudflare-config.test.ts` の「registered Durable Object migration history」のテストで固定している。Web Worker が ISR 用のキャッシュ基盤を持たないこと自体は [ADR-0013](../adr/0013-no-shared-cache-for-user-data.md) の決定である。
