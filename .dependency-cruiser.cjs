/**
 * dependency-cruiser 設定。
 *
 * 依存境界の一次ソースは docs/design.md である。ルールは以下の節に厳密に対応させる：
 *   - apps/web のルール … docs/design.md §8.1（フロントエンドの依存方向）
 *   - apps/api のルール … docs/design.md §10.1（全体方針：軽量レイヤードアーキテクチャ）
 * ルールを追加・変更する場合は、先に design.md を更新してから本ファイルを直す（仕様駆動開発、AGENTS.md 参照）。
 *
 * lint（import グラフ）で機械検証できない範囲は docs/design.md §5 に明記する：
 *   - service → D1 型（`D1Database` 等）。`@cloudflare/workers-types` の ambient 型で import 文を伴わないため検証対象にできない
 *   - route → dal repository 関数の直接呼び出し。import 自体は deps factory の取得に必要なため禁止できず、「呼び出し方」はレビューで担保する
 */

const path = require('node:path')

const resolveConfigPath = path.resolve(__dirname, '.dependency-cruiser.resolve.cjs')

// dependency-cruiser の `to.path` はモジュール指定子ではなく `resolved`（解決済みパス）
// にマッチさせる（実機検証で確認済み）。pnpm はネストした store
// （`node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/...`）を使うため、
// npm パッケージを名指しで禁止するルールは resolved パス末尾の
// `node_modules/<pkg>` セグメントにマッチさせる。
function npmPackagePath(pPackageName) {
  return `(^|/)node_modules/${pPackageName}(/|$)`
}

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ---------------------------------------------------------------------
    // apps/web（docs/design.md §8.1）
    // ---------------------------------------------------------------------
    {
      name: 'web-app-no-content-or-feature-internals',
      severity: 'error',
      comment:
        'app/**（page.tsx・layout.tsx）は content ローダーと feature 内部層（api / mapper / client hooks）を直接 import しない。loader 呼び出しと feature component への props 渡しに徹する。docs/design.md §8.1 の依存許可表を参照。',
      from: { path: '^apps/web/src/app/' },
      to: {
        path: [
          '^apps/web/src/lib/content',
          '^apps/web/src/features/[^/]+/api/',
          '^apps/web/src/features/[^/]+/mapper\\.ts$',
          '^apps/web/src/features/[^/]+/client/hooks/',
        ],
      },
    },
    {
      name: 'web-mapper-pure-transform-only',
      severity: 'error',
      comment:
        'features/*/mapper.ts は Content data / DTO → ViewModel の純粋変換に徹する。content ローダー・API client・React に依存しない。docs/design.md §8.1 の依存許可表を参照。',
      from: { path: '^apps/web/src/features/[^/]+/mapper\\.ts$' },
      to: {
        path: ['^apps/web/src/lib/content', '^apps/web/src/lib/api', npmPackagePath('react')],
      },
    },
    {
      name: 'web-client-no-server-or-content',
      severity: 'error',
      comment:
        'features/*/client/** は同/他 feature を問わず server 専用モジュールと content ローダーを直接 import しない。docs/design.md §8.1 の依存許可表を参照。',
      from: { path: '^apps/web/src/features/[^/]+/client/' },
      to: {
        path: ['^apps/web/src/features/[^/]+/server/', '^apps/web/src/lib/content'],
      },
    },
    {
      name: 'web-ui-no-lower-layers',
      severity: 'error',
      comment:
        'components/ui は feature 非依存の汎用表示部品。app・features・API client・content ローダーに依存しない。docs/design.md §8.1 の依存許可表を参照。',
      from: { path: '^apps/web/src/components/ui/' },
      to: {
        path: [
          '^apps/web/src/app/',
          '^apps/web/src/features/',
          '^apps/web/src/lib/api',
          '^apps/web/src/lib/content',
        ],
      },
    },
    {
      name: 'web-no-cross-feature-internals',
      severity: 'error',
      comment:
        'feature 間の再利用は features/shared の小さい純粋変換、または公開された表示 component（client/components）の props 契約を境界にする。他 feature の server / api / mapper.ts / client/hooks は直接 import しない（同 feature 内の参照・他 feature の client/components の再利用は許可）。docs/design.md §8.1 の依存許可表・「feature 間の再利用」記述を参照。' +
        ' 現状は client/hooks 等を名指しで禁止する deny-list 方式。client/ 配下に新しい内部専用ディレクトリが増えたら、このルールへの追加を忘れずに行うこと（allow-list 方式への切り替えは将来の検討候補）。',
      from: { path: '^apps/web/src/features/([^/]+)/' },
      to: {
        path: [
          '^apps/web/src/features/[^/]+/server/',
          '^apps/web/src/features/[^/]+/api/',
          '^apps/web/src/features/[^/]+/mapper\\.ts$',
          '^apps/web/src/features/[^/]+/client/hooks/',
        ],
        pathNot: '^apps/web/src/features/$1/',
      },
    },
    {
      name: 'web-server-no-client-hooks',
      severity: 'error',
      comment:
        'features/*/server は client/hooks（mutation・通信 state ロジック）を取り込まない。同 feature・他 feature を問わず禁止する（web-no-cross-feature-internals は同 feature を pathNot で除外するため、この禁止だけは feature 名を問わない専用ルールにする）。docs/design.md §8.1 の依存許可表「server」行・§5 を参照。',
      from: { path: '^apps/web/src/features/[^/]+/server/' },
      to: { path: '^apps/web/src/features/[^/]+/client/hooks/' },
    },
    {
      name: 'web-shared-pure-transform-only',
      severity: 'error',
      comment:
        'features/shared は feature 横断の小さい純粋変換のみを担う。共通 ViewModel・loader・hook の保持や fetch・副作用を持たない（content ローダー・API client・React に依存しない）。docs/design.md §8.1 の依存許可表「features/shared」行を参照。',
      from: { path: '^apps/web/src/features/shared/' },
      to: {
        path: ['^apps/web/src/lib/content', '^apps/web/src/lib/api', npmPackagePath('react')],
      },
    },
    {
      name: 'web-components-root-no-lower-layers',
      severity: 'error',
      comment:
        'components（root）は全画面共通のレイアウト shell・テーマ切替のみを担う。feature 内部層（server/client/api/mapper）・content・API への直接アクセスを禁止する。docs/design.md §8.1 の依存許可表「components（root）」行を参照。',
      from: { path: '^apps/web/src/components/(?!ui/)' },
      to: {
        path: [
          '^apps/web/src/features/[^/]+/server/',
          '^apps/web/src/features/[^/]+/client/',
          '^apps/web/src/features/[^/]+/api/',
          '^apps/web/src/features/[^/]+/mapper\\.ts$',
          '^apps/web/src/lib/content',
          '^apps/web/src/lib/api',
        ],
      },
    },
    {
      name: 'web-lib-no-app-or-features',
      severity: 'error',
      comment:
        'lib（API client 生成・HTTP response 処理・content index などの横断インフラ）は app・features に依存しない（画面都合の変換を持ち込まない）。docs/design.md §8.1 の依存許可表「lib」行を参照。',
      from: { path: '^apps/web/src/lib/' },
      to: {
        path: ['^apps/web/src/app/', '^apps/web/src/features/'],
      },
    },

    // ---------------------------------------------------------------------
    // apps/api（docs/design.md §10.1）
    // ---------------------------------------------------------------------
    {
      name: 'api-service-no-http-db-framework',
      severity: 'error',
      comment:
        'services/** は route・dal・Hono・Drizzle の型に依存しない純 TS ユースケース層。渡された deps だけを呼ぶ。docs/design.md §10.1 の import 許可図を参照。',
      from: { path: '^apps/api/src/services/' },
      to: {
        path: [
          '^apps/api/src/routes/',
          '^apps/api/src/dal/',
          npmPackagePath('hono'),
          npmPackagePath('drizzle-orm'),
        ],
      },
    },
    {
      name: 'api-dal-no-http',
      severity: 'error',
      comment:
        'dal/** は HTTP レイヤー（routes・Hono）に依存しない。docs/design.md §10.1 の import 許可図を参照。',
      from: { path: '^apps/api/src/dal/' },
      to: { path: ['^apps/api/src/routes/', npmPackagePath('hono')] },
    },
    {
      name: 'api-dal-services-type-only',
      severity: 'error',
      comment:
        'dal/** → services/** は service が定義する deps 型の `import type` のみ許可する（値 import は禁止）。自身が throw するドメインエラーに限り services/errors からの値 import は例外的に許可する。docs/design.md §10.1「dal は自身が throw するドメインエラーに限り services/errors から値 import してよい。import type に限定されるのは service の deps 型である」を参照。',
      from: { path: '^apps/api/src/dal/' },
      to: {
        path: '^apps/api/src/services/',
        pathNot: '^apps/api/src/services/errors',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'api-middleware-no-routes-services-dal',
      severity: 'error',
      comment:
        'middleware/** は routes・services・dal を import しない（env 型・fixed-user の値 import のみ許可）。docs/design.md §10.1 の import 許可図を参照。',
      from: { path: '^apps/api/src/middleware/' },
      to: {
        path: ['^apps/api/src/routes/', '^apps/api/src/services/', '^apps/api/src/dal/'],
      },
    },
    {
      name: 'api-content-sync-shared-only',
      severity: 'error',
      comment:
        'content-sync.ts は gray-matter・packages/shared のみに依存する。routes・services・dal・middleware を import しない。docs/design.md §10.1 の import 許可図を参照。',
      from: { path: '^apps/api/src/content-sync\\.ts$' },
      to: {
        path: [
          '^apps/api/src/routes/',
          '^apps/api/src/services/',
          '^apps/api/src/dal/',
          '^apps/api/src/middleware/',
        ],
      },
    },
  ],
  options: {
    // `import type` も依存として拾い、dependencyTypes に `type-only` を付与させる
    // （dal → services の type-only 例外ルールに必要）。
    tsPreCompilationDeps: true,

    enhancedResolveOptions: {
      // package.json の `exports` フィールド（サブパス export）を解決させる。
      // これがないと `hono/cors`・`hono/factory`・`drizzle-orm/d1` のような
      // サブパス import が couldNotResolve になり、resolved パスへマッチさせる
      // npm パッケージ禁止ルール（npmPackagePath）をすり抜ける（実機検証で確認済み）。
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },

    // apps/web の `@/*` alias（apps/web/tsconfig.json の paths）を解決する。
    // apps/api は相対 import のみで alias を持たないため影響しない。
    //
    // tsConfig 経由にしない理由: dependency-cruiser 内部の tsconfig-paths は
    // TypeScript 4.1+ の「`paths` のみ指定して `baseUrl` を省略できる」記法を
    // 解釈できず、`baseUrl` 未指定時は実行時 cwd へフォールバックして `@/*` を
    // 解決できない（実機検証で確認済み）。その回避のために
    // apps/web/tsconfig.json へ `baseUrl` を足すと、`baseUrl` が
    // TypeScript 6.0 で非推奨・7.0 で削除予定であるため将来壊れる。
    // そこで tsconfig に依存せず resolver へ alias を直接渡している。
    webpackConfig: {
      fileName: resolveConfigPath,
    },

    // node_modules 配下には潜らない（npm パッケージ自体への import エッジは
    // ルール判定のため残す必要があるので、node_modules を options.exclude には
    // 入れない。exclude はグラフから完全に取り除いてしまい、`to: { path: '^hono($|/)' }`
    // のようなルールが一切マッチしなくなることを実機検証で確認した）。
    doNotFollow: {
      path: 'node_modules',
    },

    exclude: [
      '(^|/)\\.next(/|$)',
      '(^|/)\\.open-next(/|$)',
      '(^|/)\\.wrangler(/|$)',
      // 自リポジトリのビルド出力のみを対象にする。`(^|/)dist(/|$)` のように
      // 無条件にすると、hono など dist/ 配下に本体を置く npm パッケージの
      // resolved パスまで誤って除外し、`to.path` ルールが一切マッチしなく
      // なることを実機検証で確認した（node_modules 配下は doNotFollow で
      // 既に再帰を止めているため、ここで node_modules を対象にする必要はない）。
      '^apps/[^/]+/dist(/|$)',
      '^packages/[^/]+/dist(/|$)',
      // Next.js の自動生成物。`/// <reference types="next/image-types/global" />` を
      // 含み、tsconfig を介さない resolver では解決できないため対象外にする
      // （実装コードではないので依存境界の検証対象でもない）。
      '^apps/web/next-env\\.d\\.ts$',
      // ビルド・同期スクリプト、lib/content 自身のテスト（docs/design.md §8.2）に加え、
      // apps/web・apps/api 双方の全テストコード（`*.test.ts(x)`・`*.integration.test.ts`）
      // を依存境界の検証対象外にする。テストは実装コードの依存方向を代表しないため
      // （例: service のテストが検証用に dal や hono を直接 import することがある）。
      // これにより §5「機械検証できる範囲」の実効範囲はテストコードを含まない。
      '^apps/web/scripts/',
      '^apps/api/scripts/',
      // lib/content.test.ts は下の `\.test\.tsx?$` に既に包含されるが、
      // §8.2 が明示する例外であることが分かるよう意図的に明記しておく。
      '^apps/web/src/lib/content\\.test\\.ts$',
      '^apps/web/src/test/',
      '\\.test\\.tsx?$',
      '\\.integration\\.test\\.ts$',
    ],
  },
}
