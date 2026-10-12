# GitHub Actions によるデプロイ運用

仕様の一次ソースは [design.md §12.9](./design.md#129-github-actions-による環境別リリースissue-36)。PR は検査のみ、`develop` は検証環境、`main` は本番環境へ、品質検査・環境別ビルドの成功後に自動反映する。デプロイの追加承認は不要。GitHub Actions の workflow は、対象ブランチへ人間がマージしてから利用する。

## 初回設定

GitHub の Settings → Environments に次を設定する。

| Environment | Deployment branches | Required reviewers |
| --- | --- | --- |
| `verification` | branch `develop` だけ（tag は許可しない） | 不要 |
| `production` | branch `main` だけ（tag は許可しない） | 不要 |

両環境とも Required reviewers・Wait timer・Custom deployment protection rules は設定しない。既に設定されている場合は解除する。許可ブランチは上記の1ブランチに限定し、設定できない場合は enable flag を有効にしない。`main` へのリリース PR のマージ判断は人間が行う。

Repository Variables:

| 名前 | 設定 |
| --- | --- |
| `DEPLOY_ACCOUNT_SUBDOMAIN` | 対象アカウントの workers.dev サブドメイン（現在は `sakai111893`） |
| `VERIFICATION_DEPLOY_ENABLED` | 初期値 `false`。下記の検証用設定がすべて完了してから `true` |
| `PRODUCTION_DEPLOY_ENABLED` | 初期値 `false`。検証成功・初回 Vinext 切替完了後に `true` |

Environment Variables（環境ごとに設定）:

| 名前 | 設定 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | 対象アカウントの ID。コードの固定対象と異なる場合は、先に設計・対象一覧を更新する |
| `WEB_ORIGIN` | 当該環境 Web の `https://<Worker名>.<subdomain>.workers.dev`。末尾 slash なし |
| `ACCESS_ISSUER` | 当該 API Access application の issuer（例 `https://<team>.cloudflareaccess.com`）。完全一致の値、末尾 slash なし |
| `ACCESS_AUDIENCE` | 当該 API application の AUD（64 桁 hex） |
| `PRODUCTION_VINEXT_READY` | production だけ。初期値 `false`。§12.4 の条件を満たし初回の Web のみの切替が完了した後に `true` |

Environment Secrets（値をチャットやファイルへコピーせず、GitHub の入力画面で登録）:

| 名前 | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 対象アカウントに限定した CI 用 token。Workers Scripts Edit、D1 Edit と、デプロイ時に必要な account 読取権限。production の照合処理は検証 Worker の deployment も読む |
| `CF_ACCESS_CLIENT_ID` | 当該環境の smoke test 専用 Access Service Token の Client ID |
| `CF_ACCESS_CLIENT_SECRET` | 同 token の Client Secret |

[Cloudflare の CI 認証](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)に従って API token を作成する。コード・通常ログ・artifact に token を保存しない。同一アカウント内の token 分離だけを、Worker / DB 単位の完全な権限分離とは扱わない。

認証付き smoke test は、[Access Service Token](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/) を各リクエストの `CF-Access-Client-Id` / `CF-Access-Client-Secret` header に付ける。運用者は Web と API の Access Application に、この token だけを許可する **Service Auth** policy を追加する。人間のログイン policy、公開 `/`・`/health`、CORS OPTIONS の既存設定は維持する。workflow は Access policy を変更しない。Web と API の JWT issuer / audience 検証も維持する。token の期限・ローテーションを管理し、認証失敗を検査の成功として扱わない。

検証用 API は現行 MVP の固定ユーザーを使う。検証 smoke test はこのユーザーの解答ログ・SRS・閲覧記録を更新する。本番データを複製せず、production の smoke test は GET / OPTIONS に限定する。Service Auth の確認だけで人間のブラウザログインや Cookie の挙動を保証できないため、初回切替時のブラウザ確認は別途実施する。

### 未作成の token を登録する手順

まず verification 用を登録し、production 用は本番の有効化前に別途登録する。

1. Cloudflare の Account API tokens → Create Token で CI 用 token を作成する。Edit Cloudflare Workers を基に、対象アカウントだけを許可し、上記の Workers / D1 操作に必要な権限を設定する。有効期限と管理者を決める。
2. GitHub の Settings → Environments → `verification` → Environment secrets → Add environment secret から、生成した token を `CLOUDFLARE_API_TOKEN` として登録する。Repository Secrets へ共通登録せず、環境ごとに管理する。
3. Cloudflare Zero Trust → Access controls → Service credentials → Service Tokens → Create Service Token で、検証 CI 用の Service Token を作成する。期限を設定し、表示された Client ID / Client Secret を同じ GitHub Environment の `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` に登録する。Client Secret は作成時の表示を失う前に登録する。
4. 検証 Web / API の Access Applications に、Action が **Service Auth**、Include が **Service Token = 作成した token** の policy を追加する。既存の人間向け Allow policy と公開パスの設定は維持する。
5. API の Access Application で issuer / AUD を確認し、同じ GitHub Environment の Variables に `ACCESS_ISSUER` / `ACCESS_AUDIENCE` を登録する。上記表の account / origin と Repository Variables も設定する。
6. 下記の検証有効化手順へ進む。token 失効時は workflow が失敗するため、期限前に更新し、GitHub Secrets も差し替える。

token の値はチャット・Issue・PR・端末履歴へ貼らず、Cloudflare と GitHub の設定画面間で登録する。

## 検証環境を有効化する

1. 上記の Environments・branch policy・Variables・Secrets・Access Service Auth を設定する。
2. workflow とスクリプトを `develop` へマージする。
3. `VERIFICATION_DEPLOY_ENABLED=true` にする。
4. Actions → Deploy → Run workflow で branch `develop` を指定する。
5. plan、適用ステップ、smoke test、GitHub Deployment の成功記録を確認する。以降の `develop` push は自動実行される。

検証用は `tech-study-lab-web-test` / `tech-study-lab-api-test` / `tech-study-lab-test`。本番向け config・URL・D1 ID を混入すると、変更前に失敗する。

## 本番を有効化する

1. #220 の CPU 軽減・無料プランでの再検証など、design.md §12.4 の初回 Vinext 切替条件を満たす。
2. 初回は既存手順どおり **Web のみ**を承認して切り替え、version・動作確認の証跡を残す。この操作を通常の DB → API → Web リリースで代用しない。
3. 同じソースを検証環境へ反映し、自動 smoke test まで成功させる。
4. production の branch policy が `main` だけを許可し、Required reviewers・Wait timer・Custom deployment protection rules が未設定であることを確認する。本番用 Variables・Secrets・Access Service Auth を設定し、`PRODUCTION_VINEXT_READY=true` と `PRODUCTION_DEPLOY_ENABLED=true` にする。
5. 人間がリリース PR を `main` へマージする。Deploy の prepare が plan と immutable artifact を生成する。
6. prepare 成功後に apply が自動開始する。plan・manifest・環境・検証済みソースの照合が通ったら remote D1 / Worker を更新し、smoke test と成功記録まで実行する。失敗した場合は後続を停止する。

本番候補は直近の成功した検証リリースと source tree が一致する必要がある。merge による SHA の差は許容するが、ソースが変わった場合は検証からやり直す。検証 Worker が手動反映や失敗途中の更新で記録と異なる場合も、本番は停止する。

## 実行順序と記録

prepare は Cloudflare の変更権限を持たず、locked dependencies、品質検査、SQL 生成、環境別 Web build / 成果物検査、API dry-run bundle を実行する。SHA・tree・全ファイルの SHA-256 を manifest に含める。API config / bundle / migration、Web `dist`、生成 SQL は同じ run / attempt の artifact に保存する。

apply は対象環境の Secrets を使用し、manifest・設定・最新 branch SHA・検証ソース、実アカウントの workers.dev subdomain、現在の API に対する Service Token 認証を変更前に検査する。次に **migration → content sync → API deploy → API health → Web upload → smoke test → 成功記録**を行う。Web upload は再ビルドせず prepare の receipt・全ファイル hash を照合する。content sync は冪等なため毎回実行する（失敗 run が D1 だけを更新した後に content が戻っても取りこぼさない）。content 差分は計画に情報として表示する。問題が空のリリースは拒否する。

同一環境の deploy / rollback は `deploy-verification` / `deploy-production` concurrency group を共有する。変更開始済みの run は新しい push でキャンセルしない。変更開始前に branch が進んでいた場合は古い run を拒否する。

結果の確認先:

- Actions の Job Summary：plan、処理段階、反映前後の Worker version、成功 / 失敗。
- `deployment-result-<run>-<attempt>` artifact：認証情報を除いた `result.json`。保持 30 日。
- GitHub Deployment：全ステップ成功時だけ作成する `tsl-release` 記録（環境・SHA・tree・content tree・version・run ID）。
- `release-<run>-<attempt>` artifact：ビルド成果物・SQL・manifest。保持 3 日。認証情報は含めないが、サーバー成果物・解答データを含む。ダウンロードには GitHub 認証と artifact のアクセス権が必要であり、公開 Web assets へ転用しない。永続的な秘密の保存先にはしない。

## 失敗・再実行

どの段階でも失敗したら後続を停止する。API 更新後に Web が失敗するなど、部分反映は起こり得る。まず Job Summary / result.json と Cloudflare の実際の version・D1 migration 履歴を確認する。レスポンス切断を理由に、その場で同じ変更を無条件に再試行しない。

原因解消後は **Re-run all jobs** または対象ブランチから Deploy を手動起動し、prepare からやり直す。失敗 job のみの再実行は artifact の run attempt が一致せず拒否される。古い SHA・期限切れ artifact は再利用しない。migration の適用済み履歴と content upsert の冪等性を使い、content sync は毎回再実行される。

認証情報不足・保護設定不足・本番切替条件未達は、成功やスキップ済みリリースとして記録しない。

## Worker の復旧

1. Cloudflare / result.json で現在の version と既知の正常 version を確認する。接続先資源や Durable Object migration の変更で rollback が制限される場合も確認する。
2. Actions → Roll back Worker → Run workflow を選ぶ。production は branch `main`、verification は `develop` を使う。
3. environment、`web` または `api`、復旧先 version UUID、確認した現在の version UUID を入力する。
4. 対象と影響を確認して Run workflow を実行する。この実行操作を復旧の承認とし、environment での追加承認は不要。実行時の実 version が入力と異なれば更新を拒否する。
5. 指定 Worker の version を戻したことを確認する。画面・API・Access / CORS を運用者が確認し、必要なら他方の Worker も対象を確認して別途手動実行する。

成功した rollback は `tsl-rollback` として記録し、従来の成功 source の証明を無効にする。次回は検証・通常 deploy から再確認する。**D1 スキーマ・content cache・学習記録は rollback されない。** DB の復旧が必要なら別途バックアップと影響を確認して承認する。[Cloudflare の rollback 制限](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
