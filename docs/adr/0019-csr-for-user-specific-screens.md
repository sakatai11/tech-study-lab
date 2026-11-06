# 0019: 認証後の4画面は、静的な枠をビルド時に生成し、ユーザー固有データをブラウザで取得・描画する

- 状態: Accepted
- 日付: 2026-11-06
- 関連: Issue #288、Issue #220、Issue #277（[ADR-0013](./0013-no-shared-cache-for-user-data.md) を置き換え、[ADR-0012](./0012-separate-web-and-api-workers.md) の決定2、[ADR-0008](./0008-production-access-boundary.md) の決定5、[ADR-0015](./0015-trust-service-binding-responses.md) の前提を変える）

## 背景

`/home`・`/review`・`/domains`・`/analytics` は、Server loader がリクエストごとにユーザー固有データを取得し、ViewModel 化して描画している（`docs/design.md` §5.3）。検証環境では `/review` の HTML が Workers Free の CPU 上限に達し、HTTP 503（`exceededCpu`）を返した。ログ上の CPU 時間は 10〜16 ms で、SSR のどの処理が支配的かは特定できていない。

Issue #220 の調査では、フレームワークの処理が約 8.5 ms を占め、要素数と「非同期の待ちの後に描く本文」が CPU を左右することが分かっている。ユーザー固有の本文を Server で描かなければ、後者が Web Worker の CPU から外れる。ただし `force-dynamic` のままでは、静的な枠と Client Component の loading 状態をリクエストごとに描画するため、フレームワークの処理は残る。

教材・演習の静的ページは、プリレンダリングした HTML / RSC を `_vinext/static-cache/` に置き、Worker が `ASSETS` binding 経由で読んで返している（[Vinext 移行の調査記録](../investigations/2026-10-04-vinext-migration.md)）。4画面の枠を同じ方式にすれば、リクエストごとの描画をなくしつつ、Worker の invocation は残る。そのため、性能試験の CPU ログ照合（測定した全リクエストを invocation log と1対1で対応付ける）は従来どおり使える。

[ADR-0013](./0013-no-shared-cache-for-user-data.md) の決定2（認証後の画面は `force-dynamic` の SSR）と決定5（`router.refresh()` で鮮度を回復する）、[ADR-0012](./0012-separate-web-and-api-workers.md) の決定2（Server loader は Service Binding で API を呼ぶ）は、この前提で書かれている。

この ADR は ADR-0013 全体を置き換える。状態行が部分的な置き換えを表せないため、ADR-0013 の決定1・3・4と境界は、決定5と境界に引き継ぐ。4画面の読み取りから Service Binding がなくなるため、ADR-0008 の決定5（`InternalApi` は Web の Server loader だけが使う）と ADR-0015（Service Binding 応答は再検証しない）は対象の経路を失う。

検討した代替案と却下理由:

- API が問題本文を返す: D1 に本文を持たせることになり、[ADR-0006](./0006-content-as-source-of-truth.md) の責務、content sync、マイグレーションの変更が必要になる。影響が最大である。
- Web Worker の Route Handler が ID から本文を返す: リクエストごとに Web Worker の CPU を使い、目的に反する。
- 要素数のさらなる削減や framework の更新: #220 で実施済みで、framework の更新は効果がなかった。下限は残る。
- 有料プランへの変更: Workers Free の継続という制約に反する。ただし、この ADR の決定で CPU 上限超過が解消しない場合の判断先とする。
- `force-dynamic` を維持し、ユーザー固有データだけを CSR にする: API の待ちと待ち後の描画は外れるが、リクエストごとの描画とフレームワークの処理が残り、CPU 上限超過を解消できる見込みが弱いため採らない。
- 問題索引を静的 JSON として配信し、Client が `fetch` する: 古い索引をキャッシュで使わない対策、索引の配信パスが Access の保護範囲に入ることの実機確認、`fetch` の直書き禁止への例外、content 生成物の追加が必要になる。page の props で渡せば索引は同じビルドの HTML / RSC に含まれ、これらが不要になるため採らない。
- SWR や TanStack Query の導入: 復習はバッチ中の問題を固定する必要があり、フォーカス復帰などの自動再検証を止める設定を重ねることになる。既存の無効化通知（`client-data-invalidation.ts`）とも二重になり、4画面に必要な機能も小さいため採らない。

## 決定

1. 4画面の `page` から `force-dynamic` を外し、静的な枠と Client Component の loading 状態だけをビルド時にプリレンダリングする（SSG）。ユーザー固有データの取得・join・ViewModel 化・描画は、HTML / RSC の生成時に実行せず、静的な成果物にユーザー固有データを含めない。
2. ユーザー固有データは Client hook が `createBrowserApiClient`（API Worker の公開 entrypoint）で取得し、共有 Zod で応答を検証してから、純粋な mapper で ViewModel 化する。4画面の読み取りに Service Binding は使わない。`client/hooks` は同 feature の `api` と `mapper` を呼んでよい。`/home` の4本の取得は1つの hook が並列に実行し、loading・エラー・再試行の状態は画面単位で1組とする。呼び出し元がなくなる `InternalApi`・Service Binding・`createServerApiClient` は撤去する。
3. content 由来のデータは、ビルド時に静的な page（Server）が作り、props で Client に渡す。復習では「正解を含まない問題索引」を渡し、Client が queue の ID と結合する。`/home` のレッスン名と `/domains` のトピック route も同じ経路で渡す。索引と content loader を Client bundle へ import せず、索引は `answerIndex` を含まない（[ADR-0002](./0002-api-authoritative-grading.md)）。
4. 鮮度は Client の取得で保つ。画面のマウント時に取得し、統計系の画面は `study-activity` の無効化通知で再取得する。復習の queue は、バッチ完了時だけ再取得し、解答ごとには差し替えない。復習のバッジと本文は同じ取得を共有する。loading・空・エラー・再試行は hook が持つ。取得状態は `lib/` の共通 hook に集約する。同じデータを複数の component が使う場合は、1つの取得結果を Context で共有する。データ取得ライブラリは導入しない。
5. ADR-0013 から次を引き継ぐ。ユーザー固有のデータ（due 件数、学習統計、復習キュー、領域別の集計、学習分析）を Web の共有キャッシュに載せない。`cacheComponents`、`'use cache'`、ISR 用の Incremental Cache・再検証 Queue は使わない。同じリクエスト内で取得を共有する React の `cache()` は許可する。ブラウザ内の取得状態の保持は、ユーザー単位の状態であり共有キャッシュではない。

## 境界

- 適用するのは `/home`・`/review`・`/domains`・`/analytics` の4画面（page の描画方式とユーザー固有データの取得）である。教材・演習の SSG、公開トップ `/`、`/learn` は変えない。
- 公開 entrypoint の検証の順序（[ADR-0008](./0008-production-access-boundary.md) の決定1〜4・6）と `user_id` の決定（[ADR-0003](./0003-server-injected-user-id.md)）は変えない。読み取りも Access の JWT 検証を通る。ADR-0008 の決定5（`InternalApi`）は、段階2の撤去で置き換える。
- 静的な成果物は Worker が `ASSETS` binding から読んで返すため、Worker の invocation は残る。性能測定の条件（対象ルート、HTML/RSC など）と CPU ログ照合は変えない。静的配信の経路で使う CPU は、検証環境の測定で確かめる。
- この決定で CPU 上限超過が解消しない場合（検証環境の全リクエストで HTTP 503 と `exceededCpu` が0件にならない場合）は、Workers Free の前提を見直す判断に進む。
- bfcache やタブ復帰時の再取得は、この ADR の対象外とする（現状も実装がない）。
- ユーザー固有データを読まない画面（公開トップ `/`、教材一覧 `/learn`、教材・演習の content route）と4画面の静的な枠は、ビルド時の静的生成にしてよい。共通シェルの due バッジとストリークは、表示後に Client が取得する。
- 実装は2段階に分ける。段階1で4画面を SSG＋CSR に切り替え、CPU 時間を前後比較する。段階2で `InternalApi`・Service Binding・`createServerApiClient` を撤去する。段階2は別の Issue で扱い、API Worker・デプロイ手順・ADR-0015 の状態変更を伴う。
- 問題索引は `/review` の HTML / RSC に含まれ、Access が保護するページと同じ範囲で配信される。大きさは問題数に比例する（2026-11-06 時点の31問で HTML 約70 KB・RSC 約52 KB）。大きくなりすぎた場合は、配信方法をこの ADR の置き換えで見直す。
- 4画面の HTML はユーザー固有データを含まないため、HTML の応答だけではデータ取得の失敗を検出できない。リリース時の smoke test は、4画面の HTML に加えて、4画面が使う API の GET を認証付きで確認する。

## 検証

- [rendering-boundaries.test.ts](../../apps/web/src/app/rendering-boundaries.test.ts): 4画面の page が `force-dynamic` もリクエスト時の処理も持たず、Server のモジュールがユーザー固有データを取得しない
- [verify-build.ts](../../apps/web/scripts/verify-build.ts): ビルド成果物で4画面がプリレンダリングされ、HTML / RSC にユーザー固有データと正解が含まれず、loading 状態を含む（CI の `verify:build`）
- [verify-ssg.ts](../../apps/web/scripts/verify-ssg.ts): 実行時に4画面の HTML / RSC がビルド成果物のまま静的配信される（`verify:ssg`）
- [load-review-index.test.ts](../../apps/web/src/features/review/server/load-review-index.test.ts): 問題索引が全問題を持ち、正解を含まない
- [use-client-query.test.ts](../../apps/web/src/lib/use-client-query.test.ts): マウント後の取得、エラーと再試行、購読したキーだけでの再取得、古い応答とアンマウント後の応答の無視
- [review-user-content.test.tsx](../../apps/web/src/features/review/client/components/review-user-content.test.tsx): バッジと本文が1回の取得を共有し、次のバッチはバッチ完了時にだけ取得し、空・エラー・整合性エラーで再試行とホームへの導線を出す
- [dashboard-user-sections.test.tsx](../../apps/web/src/features/dashboard/client/components/dashboard-user-sections.test.tsx): `/home` の取得を並列に行い、状態を画面単位で1組にし、due 件数だけの失敗では画面を出し、記録後に取得し直す
- [domain-progress-section.test.tsx](../../apps/web/src/features/domains/client/components/domain-progress-section.test.tsx)・[analytics-user-content.test.tsx](../../apps/web/src/features/analytics/client/components/analytics-user-content.test.tsx): ブラウザで取得し、loading とエラーからの再試行を表示する
- [deployment-smoke.test.mjs](../../scripts/deployment-smoke.test.mjs): smoke test が4画面の使う API の GET を認証付きで確認し、失敗でリリースを止める

性能測定の条件（`PERFORMANCE_CONDITIONS`）は変えない。CPU 時間の前後比較は、既存の条件の HTML と RSC で行う。

テストで直接検証しない決定: 決定2のうち Access の cookie と CORS の実機確認、および決定4のブラウザでの表示確認（認証済みブラウザで4画面のデータ表示、解答後と次バッチの反映）は、検証環境での手動確認と `docs/deployment.md` の運用手順で行う。ブラウザの自動テストは導入しない。
