# 0019: 認証後の4画面は、静的な枠をビルド時に生成し、ユーザー固有データをブラウザで取得・描画する

- 状態: Proposed
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
- SWR や TanStack Query の導入: 復習はバッチ中の問題を固定する必要があり、フォーカス復帰などの自動再検証を止める設定を重ねることになる。既存の無効化通知（`client-data-invalidation.ts`）とも二重になり、4画面に必要な機能も小さいため採らない。

## 決定

1. 4画面の `page` から `force-dynamic` を外し、静的な枠と Client Component の loading 状態だけをビルド時にプリレンダリングする（SSG）。ユーザー固有データの取得・join・ViewModel 化・描画は、HTML / RSC の生成時に実行せず、静的な成果物にユーザー固有データを含めない。
2. ユーザー固有データは Client hook が `createBrowserApiClient`（API Worker の公開 entrypoint）で取得し、共有 Zod で応答を検証してから、純粋な mapper で ViewModel 化する。4画面の読み取りに Service Binding は使わない。`client/hooks` は同 feature の `api` と `mapper` を呼んでよい。`/home` の4本の取得は1つの hook が並列に実行し、loading・エラー・再試行の状態は画面単位で1組とする。呼び出し元がなくなる `InternalApi`・Service Binding・`createServerApiClient` は撤去する。
3. 復習の問題本文は、ビルド時に生成する「正解を含まない問題索引」を静的 JSON として保護パス配下に配信し、Client が `fetch` して queue の ID と結合する。索引を Client bundle へ import しない。索引は `answerIndex` を含まない（[ADR-0002](./0002-api-authoritative-grading.md)）。
4. 鮮度は Client の取得で保つ。画面のマウント時に取得し、統計系の画面は `study-activity` の無効化通知で再取得する。復習の queue は、バッチ完了時だけ再取得し、解答ごとには差し替えない。復習のバッジと本文は同じ取得を共有する。loading・空・エラー・再試行は hook が持つ。取得状態は `lib/` の共通 hook に集約し、同じキーの進行中の取得を共有する。データ取得ライブラリは導入しない。
5. ADR-0013 から次を引き継ぐ。ユーザー固有のデータ（due 件数、学習統計、復習キュー、領域別の集計、学習分析）を Web の共有キャッシュに載せない。`cacheComponents`、`'use cache'`、ISR 用の Incremental Cache・再検証 Queue は使わない。同じリクエスト内で取得を共有する React の `cache()` は許可する。ブラウザ内の取得状態の保持は、ユーザー単位の状態であり共有キャッシュではない。

## 境界

- 適用するのは `/home`・`/review`・`/domains`・`/analytics` の4画面（page の描画方式とユーザー固有データの取得）である。教材・演習の SSG、公開トップ `/`、`/learn` は変えない。
- 公開 entrypoint の検証の順序（[ADR-0008](./0008-production-access-boundary.md) の決定1〜4・6）と `user_id` の決定（[ADR-0003](./0003-server-injected-user-id.md)）は変えない。読み取りも Access の JWT 検証を通る。ADR-0008 の決定5（`InternalApi`）は、段階2の撤去で置き換える。
- 静的な成果物は Worker が `ASSETS` binding から読んで返すため、Worker の invocation は残る。性能測定の条件（対象ルート、HTML/RSC など）と CPU ログ照合は変えない。静的配信の経路で使う CPU は、検証環境の測定で確かめる。
- この決定で CPU 上限超過が解消しない場合（検証環境の全リクエストで HTTP 503 と `exceededCpu` が0件にならない場合）は、Workers Free の前提を見直す判断に進む。
- bfcache やタブ復帰時の再取得は、この ADR の対象外とする（現状も実装がない）。
- ユーザー固有データを読まない画面（公開トップ `/`、教材一覧 `/learn`、教材・演習の content route）と4画面の静的な枠は、ビルド時の静的生成にしてよい。共通シェルの due バッジとストリークは、表示後に Client が取得する。
- 実装は2段階に分ける。段階1で4画面を SSG＋CSR に切り替え、CPU 時間を前後比較する。段階2で `InternalApi`・Service Binding・`createServerApiClient` を撤去する。段階2は別の Issue で扱い、API Worker・デプロイ手順・ADR-0015 の状態変更を伴う。
- 索引は Access が保護する `/review/` 配下に置く（ファイル名は実装で決める）。この配信パスが、検証環境と本番の Cloudflare Access の保護範囲に入ることは、運用者が実機で確認する。リポジトリからは確認できない。
- 索引はビルドごとに内容が変わり得る。ブラウザや CDN のキャッシュで古い索引を使わないよう、ファイル名に内容のハッシュを含めるか、再検証を要求する応答ヘッダーを付ける。古い索引にない問題 ID は mapper が除外し、決定4の整合性エラーの規則に従う。
- 4画面の HTML はユーザー固有データを含まないため、HTML の応答だけではデータ取得の失敗を検出できない。リリース時の smoke test は、4画面の HTML に加えて、4画面が使う API の GET を認証付きで確認する。

## 検証

（骨子。実装時に、`[ADR-0019]` を付けたテストへのリンクに置き換える）

- 4画面の page が `force-dynamic` を宣言せず、Server でユーザー固有データを取得しないこと（`rendering-boundaries.test.ts` を変更。現在は `force-dynamic` の宣言を要求している）
- ビルド成果物で4画面がプリレンダリングされ、HTML / RSC に正解やユーザー固有データが含まれないこと（`verify-build.ts` を変更。現在は4画面が prerender されないことを要求している）
- 実行時に4画面の HTML / RSC が静的配信（`x-vinext-cache: HIT`）で返ること（`verify-ssg.ts` を変更。現在は4画面が `no-store` のリクエスト時描画であることを要求している）
- smoke test が、4画面の HTML と、4画面が使う API の GET を認証付きで確認すること（`deployment-smoke.mjs` を変更）
- 問題索引に `answerIndex` が含まれないこと（索引の生成スクリプトのテスト）
- `content:check` が索引の差分を検出すること
- 復習の queue が、解答ごとではなくバッチ完了時だけ再取得されること（`review-runner.test.tsx` を拡張）
- 変更範囲判定で、索引の出力パスが web の対象になること（`deployment-changes.test.mjs` にケースを追加）
- 未認証で索引の URL が Access にリダイレクトされること（`deployment-smoke`）
- 取得後の表示と loading・空・エラー・再試行（hook と component の Vitest。API は `fetch` のモック）

性能測定の条件（`PERFORMANCE_CONDITIONS`）は変えない。CPU 時間の前後比較は、既存の条件の HTML と RSC で行う。

テストで直接検証しない決定: 決定2のうち Access の cookie と CORS の実機確認、および決定4のブラウザでの表示確認（認証済みブラウザで4画面のデータ表示、解答後と次バッチの反映）は、検証環境での手動確認と `docs/deployment.md` の運用手順で行う。ブラウザの自動テストは導入しない。
