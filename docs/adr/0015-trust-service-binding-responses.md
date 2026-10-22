# 0015: Service Binding 経由の API 応答は Server loader で Zod 再検証しない

- 状態: Accepted
- 日付: 2026-10-22
- 関連: Issue #220

## 背景

Web の feature API wrapper は、Server loader と Client hook の両方から呼ばれ、API 応答を共有 Zod スキーマで `parse` してから返していた（`docs/design.md` の「共有 Zod による入出力検証」）。Issue #220 で Workers Free の検証 Web を再測定したところ、`/home` の HTML / RSC で `Worker exceeded CPU time limit.` が再発した。Workers Free の CPU 上限は 1 request あたり 10 ms だが、検証 Web の `/home` HTML は CPU 時間の中央値が 37 ms だった。

検証 Web とローカルの CPU プロファイルでは、応答の Zod 検証が `/home` の RSC 1 request あたり約 3.5 ms を占めた。`/home` は 5 つの API 応答を検証し、182 日分のヒートマップは要素ごとの日付 refine と連続性の `superRefine` を通る。他の画面も同じ wrapper で応答を検証している。

Server loader は、名前付き Service Binding で同じリリースの API Worker を呼ぶ（ADR-0012）。API は応答を共有スキーマの型で返し、`hc<AppType>` の型が Web と API の型の一致をビルド時に保証する。リリースは API を先に、Web を後に更新する（ADR-0010）。そのため、Server loader での実行時の再検証は、検出できる不一致に比べて CPU の負担が大きい。一方、ブラウザは公開 API を Access の cookie 付きで呼び、別の版の Web が開いたままの場合がある。

検討した代替案と却下理由:

- 全経路で検証を維持し、スキーマの refine を軽くする: 削れるのは 1 ms 前後で、10 ms 枠に対する効果が小さい。
- 有料プランへの変更: Issue #220 の制約（Workers Free の継続）に反する。
- Zod のメジャー更新: API の `zValidator`、content の検証など影響範囲が広く、CPU 軽減の根拠がない処理まで巻き込む。

## 決定

1. Server loader が Service Binding（`API`）から作った API client の応答は、feature API wrapper で Zod の再検証をせずに返す。
2. ブラウザ用の API client と、本番以外で Service Binding がない場合の URL フォールバックの client は、従来どおり共有 Zod スキーマで応答を検証し、違反を例外にする。
3. 要求（request）側の検証、API の `zValidator`、content の検証は変更しない。
4. 検証を省くかどうかは client の生成元だけで決め、feature API wrapper ごとに個別に判断しない。

## 境界

- 適用するのは、Service Binding 経由で受け取った API Worker の応答だけである。外部サービスや、Service Binding 以外の経路から受け取るデータには適用しない。
- 応答の型は `hc<AppType>` と共有 Zod スキーマの `z.infer` が引き続き保証する。API の route は共有スキーマの型を返す（`satisfies`）。
- Web と API を同じリリースで更新しなくなった場合や、Service Binding の接続先が別チームの API になった場合は、この ADR を置き換える。
- API の互換性を崩す変更は、ADR-0010 のリリース順序と後方互換の前提で扱う。この ADR はその前提を緩めない。

## 検証

- [api-server.test.ts](../../apps/web/src/lib/api-server.test.ts): Service Binding の client だけ応答の再検証を省き、URL フォールバックの client は検証する
- [api.test.ts](../../apps/web/src/lib/api.test.ts): ブラウザ用の client は応答を共有スキーマで検証し、違反を例外にする
