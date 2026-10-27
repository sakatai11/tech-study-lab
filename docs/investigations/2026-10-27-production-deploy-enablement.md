# 本番自動デプロイの有効化前確認（Issue #262）

2026-10-27 の再測定で、軽減後の検証版でも `/home` の CPU 上限超過を確認した。本番自動デプロイの有効化条件は未達であり、`PRODUCTION_DEPLOY_ENABLED=false` を維持する。production Environment のブランチ制限と非秘密 Variables は準備したが、本番 Web の Vinext 初回切替と本番用 Secrets の登録も残っている。

## 検証リリースは成功し、稼働版の表示も一致した

GitHub API、Actions のジョブ・結果 artifact、Cloudflare Dashboard で検証リリースを確認した。認証情報の値は取得・記録していない。

| 項目 | 確認結果 |
| --- | --- |
| 対象 commit（確認時の develop） | `19ecdcee81977e109260cc2cff101781ab589a61` |
| source tree | `8f605770493e118c0ec65fe2bf6004048d9dde7f` |
| content tree | `9097b5799e5f22d4e90a4eb2058c646c209e9f34` |
| Actions | [Deploy run 40501209063](https://github.com/sakatai11/tech-study-lab/actions/runs/40501209063)、push 起動、prepare / apply とも成功 |
| 成功記録 | GitHub Deployment `7358021043`、`verification` / `tsl-release`、status `success`（UTC `2026-10-27T12:09:04Z`） |
| Web version | `3f8b3c1a-5d5a-420a-a6c8-8e8cc77642ae` |
| API version | `7dcc659a-e9ea-48c1-a115-7c9bef03f665` |
| 稼働版の照合 | Dashboard の Web `3f8b3c1a` / API `7dcc659a` がともに 100%。完全な UUID は Deployment payload / result artifact の値 |
| 検証リソース | Web `tech-study-lab-web-test`、API `tech-study-lab-api-test`、API の `DB` は `tech-study-lab-test` |
| 設定 | `VERIFICATION_DEPLOY_ENABLED=true`。Environment は branch `develop` だけを許可。Secrets は必要な3名称の登録を確認（値は未取得） |

`deployment-result-40501209063-1` の `result.json` は、`preflight → migrations → sync → api → apiHealth → web → smoke → record` の全段階を完了し、`success: true` だった。反映前は Web `71084db4-bd0d-4493-bedb-50dac48b0b29` / API `b51d2f18-253f-41f5-8de2-f8bf1d2bac59`、反映後は上表の版である。これは検証環境での記録であり、本番リリースの証明には使わない。

## 本番 Web は初回 Vinext 切替の前だった

[本番 Web の Dashboard](https://dash.cloudflare.com/4459a4d59a634a07eac0400d39b84f20/workers/services/view/tech-study-lab-web/production) の active version は `226aec5b`（100%）だった。`WORKER_SELF_REFERENCE`、`NEXT_CACHE_DO_QUEUE`、`NEXT_INC_CACHE_R2_BUCKET` が残っており、OpenNext の構成と一致する。Workers Logs / Traces は無効と表示された。

この version の省略表示は、[2026-10-11 の本番不変確認](./2026-10-11-test-resource-rename.md#確認結果)にある `226aec5b-cae8-4e08-8aa7-3f1e36f76152` と一致する。ただし、今回の UI 確認だけでは完全な UUID と対応するソース commit を再取得できていない。初回切替前に、認証済み Wrangler の `deployments list` / `versions view` と当時のデプロイ記録で確定する。現在の main SHA を、この手動反映版の commit と見なさない。

確認時の main は `683077c8dab704b84e8c1a5fb92a98a87141a486`、tree は `77628c6bca6c9fff873fd5aed2f8b9bb46302f3e`。検証成功版とは source tree が異なる。main の Deploy run [39096588527](https://github.com/sakatai11/tech-study-lab/actions/runs/39096588527) はスキップされており、本番の成功 Deployment 記録も取得されなかった。

本番への GET / OPTIONS による確認結果は次のとおり。学習記録への書き込みは行っていない。

| 確認 | 結果 |
| --- | --- |
| Web `/` | 200 / HTML |
| API `/health` | 200 / JSON |
| 未認証 Web `/home` | Access のログインへ 302 |
| 未認証 API `/domains` | Access のログインへ 302 |
| API `/answers` の credentialed CORS preflight | 204、許可 Origin は本番 Web、credentials は `true`、methods は `GET,POST,OPTIONS`、headers は `Content-Type` |

これは公開・未認証・preflight の確認に限る。認証済み本番画面、Cookie の挙動、production 用 Service Auth、Vinext 切替後の正常性は未確認である。

## 軽減後も CPU 上限超過が再発し、有効化を見送った

#220 の軽減は [PR #265](https://github.com/sakatai11/tech-study-lab/pull/265) で develop にマージ済みであり、上記検証版にも含まれる。[2026-10-22 の CPU 再検証](./2026-10-04-vinext-migration.md#2026-10-22-issue-220-の現行版での-cpu-再検証)とは対象版を分け、利用者が認証済みの Chrome で再測定した。

測定は `scripts/verification/route-stability.browser.js` の phase / commit / Web・API version だけを上表に合わせ、GET の条件・順序・停止判定を維持した。Workers Free の表示を Dashboard で確認した。Chrome 152、viewport `728×768` / DPR 1、colo は全件 NRT。前回の viewport `1591×855` / DPR 1 とは異なるが、測定は画面描画を含まない fetch による逐次 GET である。検証データは削っていない。

| 項目 | 結果 |
| --- | --- |
| 測定時間（UTC） | `2026-10-27T14:29:40.215Z` ～ `14:30:00.388Z` |
| 連続完走 | 0 / 3 回。1 回目の65件目で停止 |
| 先行応答 | 64件は検証合格。warmup 16件を除いた有効実測は48件 |
| 最初の異常応答 | `/home` HTML、実測 round 7、503 / `text/html; charset=UTF-8` / 4,757 bytes |
| 応答の Ray ID | `a512656d0b1662db-NRT` |
| Cloudflare イベント時刻 | `2026-10-27 23:30:00.497 JST`（UTC `14:30:00.497Z`） |
| Worker version | `3f8b3c1a-5d5a-420a-a6c8-8e8cc77642ae` |
| outcome / CPU | `exceededCpu` / `cpuTimeMs: 11`（`wallTimeMs: 24`） |
| エラーメッセージ | `Worker exceeded CPU time limit.` |
| ログの対応付け | requestId `06c183d3f05295432b8359b4bd05986e`、rayId `a512656d0b1662db` が request イベントと CPU エラーで一致し、ブラウザ応答の Ray ID とも一致 |

応答は元の origin/path を維持し、`no-store`、cache HIT なし、`cf-mitigated: challenge` なしだった。同時間帯の Observability を `exists($metadata.error)` で絞り、request イベントと CPU エラーを確認した。表示されたエラー2件は同じ request に対応し、失敗 request が2件という意味ではない。初回の異常で停止し、同じ測定や失敗 request の再試行はしていない。

測定 JSON は `apps/web/.wrangler/verification/issue-262/2026-10-27-route-stability-report.json`（Git 管理外、SHA-256 `d13972d045ebf46c09829178faf76c616d77f9e4aaca03fe5dc3a00544174380`）、実行スクリプトは同じフォルダーの `2026-10-27-route-stability.browser.js`（SHA-256 `bb027a95b80cc5505eee5a6b3e873b5c14b7f37deb139b648b0b78f1fef061f8`）に保存した。Cookie / JWT / request headers / 応答本文は保存していない。

この結果から、CPU の前提条件は未達と判断した。今回の確認では軽減後の改善率や全 request の CPU 分布は評価していない。追加の原因調査・軽減と再検証は #220 で扱い、#262 の本番 Web 切替・有効化へは進まない。

## production のブランチ制限と非秘密設定は準備した

着手時、GitHub Environments の一覧には `verification` だけが存在した。今回 `production` を作成し、branch `main` だけを許可した（tag は許可しない）。設定を読み戻し、protection rule は branch policy のみ、Required reviewers / Wait timer なし、Custom deployment protection rules は 0 件と確認した。

production の非秘密 Variables は `CLOUDFLARE_ACCOUNT_ID` / `WEB_ORIGIN` / `ACCESS_ISSUER` / `ACCESS_AUDIENCE` を登録した。Origin と Access の値は本番 API Worker の既存設定から照合した。`PRODUCTION_VINEXT_READY=false`、Repository Variable `PRODUCTION_DEPLOY_ENABLED=false` を維持している。

production の Environment Secrets は 0 件だった。`CLOUDFLARE_API_TOKEN` / `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` の本番用登録と、Web / API の対応する Service Auth policy の確認・設定が残る。verification の秘密値を読み出したり、本番へ複製したりしていない。運用者が [token を登録する手順](../deployment.md#未作成の-token-を登録する手順)に従い、Cloudflare と GitHub の設定画面間で登録する。

残る操作は [本番を有効化する手順](../deployment.md#本番を有効化する)に従う。

1. 同じ検証版・無料プラン・条件で CPU 再検証を完了する。HTTP 200 だけで成功とせず、同時間帯・対象版の CPU ログを照合する。
2. 本番の既知 version・対応 commit を確定し、同じ候補ソースの主要導線を検証する。承認した対象・入力値・手順に基づき、初回は Web だけを Vinext へ切り替える。
3. `production` Environment に branch `main` だけを許可する。Required reviewers / Wait timer / Custom deployment protection rules は設けず、本番専用の Variables / Secrets と Web / API の Service Auth を用意する。
4. 初回切替完了と検証成功の証跡を確認してから、`PRODUCTION_VINEXT_READY=true`、`PRODUCTION_DEPLOY_ENABLED=true` を設定する。
5. 人間が develop → main のリリース PR をマージし、その push で自動起動した同じ run の prepare / apply、smoke、成功 Deployment、反映前後の Worker version を記録する。source tree と実稼働 verification version は変更開始直前にも照合する。

失敗時は後続を止め、Job Summary / result artifact と実際の Worker version・D1 migration 履歴を確認してから prepare を含む全ジョブを再実行する。Worker の復旧は既知の正常 version と確認した現在版を指定する既存の手動 workflow を使う。D1 のスキーマ・content・学習記録は Worker rollback では戻らない。

## #36 の承認待ちの記述は現行運用と異なる

#36 の本文・チェックリストには「本番は追加承認待ち」が残っているが、[PR #229](https://github.com/sakatai11/tech-study-lab/pull/229) は品質検査後の自動反映へ変更した。現行 workflow と `docs/deployment.md` は、main マージ後の追加デプロイ承認を要求しない。初回 Web 切替の条件・承認と、人間による PR マージの判断は維持する。

#36 の本番自動反映に関する残条件、および #34 の「main の自動デプロイを #36 と照合する」条件は、#262 の本番実行証跡で判断する。この確認記録や検証環境の成功だけで、#262 / #36 / #34 を完了・close しない。

既存実装の確認として `pnpm deployment:test` の10テストが成功した。本番 smoke の GET / OPTIONS 制限、追加承認を要求しない厳密なブランチ制限、未検証ソース・古い run の拒否、各段階の失敗時停止を含む。`pnpm lint`、`pnpm architecture:check`、`git diff --check` も成功した。テストは外部操作を代替しており、本番への実反映の代わりにはならない。

## 2026-10-28: 本番用 Secrets と Service Auth を設定した

利用者が初回設定を依頼し、2つの token の発行・本番 Access アプリへの Service Auth 追加を承認した。以下は前日の未設定状態からの更新であり、Web の Vinext 切替や本番自動デプロイの有効化は含まない。

| 対象 | 登録・確認結果 |
| --- | --- |
| CI API token | `tech-study-lab-production-deploy`。対象アカウントの Workers Scripts Write / D1 Write / Account Settings Read。90日、有効期限 `2027-01-26` |
| Access Service Token | `tech-study-lab-production-smoke`。有効期間 `2160h`（90日）、期限 `2027-01-26 00:07 JST`、状態は有効 |
| GitHub production Secrets | `CLOUDFLARE_API_TOKEN` / `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` の3名称を API のメタデータで読み戻して確認 |
| Access アプリ | 既存の `tech-study-lab`（`34da82a0-3a6f-406c-8312-1c8c93245895`）。本番 Web の学習ルートと本番 API に適用する共通アプリ |
| 追加ポリシー | `Production CI Service Auth`（`bf615759-3ab0-4680-9198-c75e01614a0a`）。Action は Service Auth、Include は上記の本番 Service Token 1件だけ |
| 既存ポリシー | `Allow owner` を維持。API health の別アプリと Bypass health、CORS preflight の設定は変更していない |

API token は対象アカウント内の Workers / D1 を更新できる権限を持つ。本番 Worker / D1 だけへの完全な権限分離とは扱わない。verification 用 token は変更・複製していない。新しい秘密値は Cloudflare の発行画面から GitHub の production Environment に登録し、チャット・ファイル・Issue・PR・端末履歴には記載していない。

Service Auth は保存後のアプリ一覧とポリシー編集画面を開き直し、適用先、Action、Include の token 名を確認した。[Cloudflare の Service Token 手順](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)に従い、Service Auth を人間向け Allow と併存させた。

### 一覧・分析ルートも Access の保護対象へ追加した

設定前の本番アプリは API 全体と Web の `home*` / `learn/*` / `quiz/*` / `review*` を保護していた。`/learn` / `/quiz` の一覧と `/domains` / `/analytics` は対象外で、未認証 GET は Access redirect を経ず、旧 Web から 404 を返していた。`/learn/*` の指定は親の `/learn` を含まない（[Cloudflare のパス指定](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/#match-multi-level-paths)）。

Vinext の画面を反映する前に ADR-0008 の境界を揃えるため、同じ本番アプリへ Web の `learn` / `quiz` / `domains` / `analytics` の4パスを追加した。既存の5宛先と2つの認証ポリシーは維持した。公開トップを対象に含める wildcard は追加していない。

変更後の未認証 GET では `/home` / `/learn` / `/quiz` / `/review` / `/domains` / `/analytics` と API `/domains` がすべて Access のログインへ 302 となった。公開 `/` と API `/health` は 200。本番 Web Origin から API `/answers` への OPTIONS は 204、許可 Origin は本番 Web、credentials は `true`、methods は `GET,POST,OPTIONS`、headers は `Content-Type` だった。GET / OPTIONS だけで確認し、学習記録は更新していない。

### 本番 Web 切替と認証付き CI の実通信確認は残る

今回の設定だけで本番用 token による CI の認証成功まで実証したとは扱わない。認証付きの実通信確認は、初回切替前の確認事項として残る。GitHub に保存した秘密値は読み出せないため、以後の確認は対象を固定した認証付きの実行経路で行い、秘密値をチャットやファイルへ持ち出さない。

`PRODUCTION_VINEXT_READY=false` / `PRODUCTION_DEPLOY_ENABLED=false` を再確認した。前日の CPU 再発を解消する修正版の検証完了、既知の本番 Worker version・対応 commit の確定、Web のみの初回切替、認証済み主要画面の確認が残る。本番 Worker / D1 の反映は行っていない。
