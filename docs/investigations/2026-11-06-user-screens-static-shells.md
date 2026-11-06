# 認証後4画面を静的な枠とブラウザでの取得に切り替えた根拠（Issue #288）

[ADR-0019](../adr/0019-csr-for-user-specific-screens.md) の判断に使った観測と、切り替え後のローカルの成果物の大きさを記録する。検証環境での CPU 時間の前後比較は、この記録の時点では未実施である。

## 検証環境で CPU 上限超過を確認した

Issue #288 の Deploy ワークフロー（[run 42055710506](https://github.com/sakatai11/tech-study-lab/actions/runs/42055710506)）の性能計測で、次を観測した。

- Attempt 2・3: スモークテストとバージョン確認の後、`/review` の HTML が HTTP 503 を返して計測が止まった。Ray ID を Web Worker のログと照合し、`outcome: exceededCpu` を確認した。ログ上の CPU 時間は 10 ms と 16 ms だった。
- Attempt 5: HTTP 200 が 528 件。取得できたログでの HTML の CPU 時間 p95 は `/home` 18 ms、`/analytics` 15 ms、`/domains` 13 ms、`/review` 11 ms。CPU ログ2件の欠落により、判定は `inconclusive` だった。
- SSR のどの処理が CPU 時間を使っているかは、ログからは特定できなかった。

## リクエスト時の描画そのものに下限がある

Issue #220 の調査（production build と `wrangler dev` に対するローカルの CPU プロファイル、`/analytics` と `/domains` を交互に計測）で、次が分かっている。

- `/domains` の約 10 ms のうち、約 8.5 ms は画面の構成を外しても残るフレームワークの処理（Vinext の request pipeline、RSC から HTML への変換、stream）だった。アプリのコードは 0.1 ms 未満だった。
- 要素数（React 要素・RSC の行）と、非同期の待ちの後に描く本文の量が CPU 時間を左右した。API を呼ばずに 5 ms 待つだけでも、同じだけ増えた。
- Vinext 1.0.1 から 1.3.1・1.4.2 への更新は効果がなかった。

このため、ユーザー固有の本文を Server で描かなくしても、`force-dynamic` のままではリクエストごとの描画とフレームワークの処理が残る。

## 静的な成果物も Worker を通って配信される

教材・演習の静的ページは、プリレンダリングした HTML / RSC を `dist/client/_vinext/static-cache/` に置き、Worker が `ASSETS` binding から読んで返している（[Vinext 移行の調査記録](./2026-10-04-vinext-migration.md)）。ルートのパスに対応する静的ファイルはないので、リクエストは Worker に届く。4画面の枠を同じ方式にしても Worker の invocation は残り、性能試験の CPU ログ照合（全リクエストを invocation log と1対1で対応付ける）はそのまま使える。

## 切り替え後のローカルの成果物

2026-11-06、作業ブランチ `docs/issue-288-csr-user-data-adr` の `pnpm --filter @tsl/web build` の後、ビルド済みの Web を `wrangler dev` で起動し、`verify:ssg` で取得した。4画面はどれも `x-vinext-cache: HIT` で、ビルド成果物と同じ内容が返った。大きさは圧縮前のバイト数である。

| 画面 | HTML | RSC |
| --- | ---: | ---: |
| `/home` | 31,183 | 12,749 |
| `/review` | 69,779 | 51,649 |
| `/domains` | 28,528 | 11,097 |
| `/analytics` | 27,909 | 10,882 |

`/review` は、正解を除いた問題索引（31問）を props として含むため大きい。

## 未確認のこと

- 検証環境での HTML / RSC の CPU 時間の前後比較と、HTTP 503・`exceededCpu` が0件になること。
- 静的配信の経路で Worker が使う CPU 時間の実測値。
