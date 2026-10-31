import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createManifest, getTarget } from './deployment-lib.mjs'
import { conditionsId } from './performance-lib.mjs'

const source = fileURLToPath(new URL('../', import.meta.url))
const verification = getTarget('verification')

test('actual apply CLI uploads prepared files in order and refuses invalid releases before any mutation [ADR-0006] [ADR-0010] [ADR-0016]', () => {
  const scenarios = [
    ...[
      undefined,
      'auth',
      'stale',
      'tamper',
      'database',
      'disabled',
      'sampling',
      'observability-token',
    ].map((failure) => ({
      environment: 'verification',
      failure,
    })),
    // Last success has the same content tree as this release: sync must still run.
    { environment: 'verification', previousContent: true },
    // Failures after the Workers are updated: the release must stop before the success record.
    ...['response', 'cpu-exceeded'].map((late) => ({ environment: 'verification', late })),
    ...[
      undefined,
      'unverified',
      'no-performance-proof',
      'vinext-not-ready',
      'branch-policy',
      'verification-changed',
    ].map((failure) => ({ environment: 'production', failure })),
  ]
  for (const { environment, failure, previousContent, late } of scenarios) {
    const target = getTarget(environment)
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'tsl-apply-test-')))
    const json = (path, value) => writeFileSync(join(root, path), JSON.stringify(value))
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
    try {
      mkdirSync(join(root, 'scripts'))
      for (const name of [
        'deployment.mjs',
        'deployment-lib.mjs',
        'deployment-smoke.mjs',
        'performance.mjs',
        'performance-lib.mjs',
      ])
        cpSync(join(source, 'scripts', name), join(root, 'scripts', name))
      symlinkSync(join(source, 'node_modules'), join(root, 'node_modules'), 'dir')
      mkdirSync(join(root, 'content'))
      writeFileSync(join(root, 'content/test.md'), 'test content')
      git('init', '-b', target.branch)
      git('add', 'content')
      git(
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '-m',
        'fixture',
      )
      const sha = git('rev-parse', 'HEAD')
      const tree = git('rev-parse', 'HEAD^{tree}')
      const release = join(root, '.deploy/release')
      for (const directory of ['api', 'web/server', 'web/client', 'content'])
        mkdirSync(join(release, directory), { recursive: true })
      json('.deploy/release/api/wrangler.json', {
        name: target.api,
        account_id: target.account,
        main: 'index.js',
        no_bundle: true,
        observability: { enabled: true, head_sampling_rate: 1 },
        d1_databases: [
          {
            binding: 'DB',
            database_name: target.database,
            database_id:
              failure === 'database' ? getTarget('production').databaseId : target.databaseId,
          },
        ],
      })
      json('.deploy/release/web/server/wrangler.json', {
        name: target.web,
        main: 'index.js',
        services: [{ binding: 'API', service: target.api, entrypoint: 'InternalApi' }],
        assets: { directory: '../client' },
        migrations:
          environment === 'production'
            ? [
                { tag: 'v1', new_sqlite_classes: ['DOQueueHandler'] },
                { tag: 'v2', deleted_classes: ['DOQueueHandler'] },
              ]
            : [],
        workers_dev: true,
        preview_urls: false,
        observability: { enabled: true, head_sampling_rate: failure === 'sampling' ? 0.5 : 1 },
      })
      json('.deploy/release/content/summary.json', {
        smokeQuestion: 'test-q1',
        smokeLesson: 'test',
      })
      writeFileSync(join(release, 'content/sync.sql'), 'SELECT 1;')
      json(
        '.deploy/release/manifest.json',
        createManifest(release, {
          environment,
          sha,
          tree,
          contentTree: git('rev-parse', 'HEAD:content'),
          questionCount: 1,
          runId: 'fixture',
          apiUrl: `https://${target.api}.fixture.workers.dev`,
          webUrl: `https://${target.web}.fixture.workers.dev`,
        }),
      )
      if (failure === 'tamper') writeFileSync(join(release, 'content/sync.sql'), 'SELECT 2;')
      mkdirSync(join(root, 'bin'))
      // Child tooling is captured, never executed. The fetch replacement refuses unknown URLs.
      writeFileSync(
        join(root, 'bin/pnpm'),
        `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(join(root, 'commands.jsonl'))}, JSON.stringify(process.argv.slice(2)) + '\\n')\n`,
      )
      chmodSync(join(root, 'bin/pnpm'), 0o755)
      writeFileSync(
        join(root, 'network.mjs'),
        `
        import { appendFileSync } from 'node:fs';
        const target = ${JSON.stringify(target)};
        const rays = [];
        const proof = {passed:true,conditionsId:${JSON.stringify(conditionsId())},tree:${JSON.stringify(tree)},runId:'7',runAttempt:'1',apiVersion:'11111111-1111-1111-1111-111111111111',webVersion:'11111111-1111-1111-1111-111111111111',cpu:{status:'passed'}};
        const verification = ${JSON.stringify(verification)};
        globalThis.fetch = async (url, options = {}) => {
          url = String(url);
          const path = new URL(url).pathname;
          if (url.startsWith('https://api.github.com/repos/test/fixture/')) {
            if (path.endsWith('/deployment-branch-policies')) return Response.json({branch_policies:[{name:process.env.FAILURE === 'branch-policy' ? '*' : target.branch,type:'branch'}]});
            if (path.endsWith('/environments/' + target.environment)) return Response.json({deployment_branch_policy:{custom_branch_policies:true}, protection_rules:[]});
            if (path.endsWith('/git/ref/heads/' + target.branch)) return Response.json({object:{sha:process.env.FAILURE === 'stale' ? 'f'.repeat(40) : process.env.GITHUB_SHA}});
            if (path.endsWith('/deployments') && options.method === 'POST') { appendFileSync(${JSON.stringify(join(root, 'records.jsonl'))}, options.body + '\\n'); return Response.json({id:1}); }
            if (path.endsWith('/deployments') && target.environment === 'production' && new URL(url).searchParams.get('environment') === 'verification') return Response.json(process.env.FAILURE === 'unverified' ? [] : [{id:2,sha:process.env.GITHUB_SHA,payload:{kind:'tsl-release',tree:${JSON.stringify(tree)},runId:'7',runAttempt:'1',apiVersion:'11111111-1111-1111-1111-111111111111',webVersion:'11111111-1111-1111-1111-111111111111',...(process.env.FAILURE === 'no-performance-proof' ? {} : {performance:proof})}}]);
            if (path.endsWith('/deployments') && process.env.PREVIOUS_CONTENT) return Response.json([{id:3,sha:'e'.repeat(40),payload:{kind:'tsl-release',contentTree:${JSON.stringify(git('rev-parse', 'HEAD:content'))}}}]);
            if (path.endsWith('/deployments')) return Response.json([]);
            if (path.endsWith('/deployments/3/statuses')) return Response.json([{state:'success'}]);
            if (path.endsWith('/deployments/1/statuses')) return Response.json({});
            if (path.endsWith('/deployments/2/statuses')) return Response.json([{state:'success'}]);
          }
          if (url.startsWith('https://api.cloudflare.com/client/v4/accounts/' + target.account + '/')) {
            if (path.endsWith('/workers/subdomain')) return Response.json({success:true,result:{subdomain:'fixture'}});
            if (path.endsWith('/d1/database/' + target.databaseId + '/query')) return Response.json({success:true,result:[{results:[{activeQuestions:1,answerLogs:2,srsStates:1,dueSrs:1,lessonViews:1}]}]});
            if (path.endsWith('/workers/observability/telemetry/query')) {
              const name = JSON.parse(options.body).parameters.filters[0].value;
              const events = name !== target.web ? [] : rays.map((rayId, i) => ({$metadata:{rayId},$workers:{scriptName:target.web,eventType:'fetch',scriptVersion:{id:'11111111-1111-1111-1111-111111111111'},outcome:process.env.LATE === 'cpu-exceeded' && i === 10 ? 'exceededCpu' : 'ok',cpuTimeMs:12,wallTimeMs:30}}));
              return Response.json({success:true,result:{events:{events,count:events.length}}});
            }
            if (path.endsWith('/d1/database/' + target.databaseId)) return Response.json({success:true,result:{name:target.database}});
            if (path.endsWith('/deployments')) return Response.json({success:true,result:{deployments:[{versions:[{version_id:process.env.FAILURE === 'verification-changed' && path.includes(verification.api) ? '22222222-2222-2222-2222-222222222222' : '11111111-1111-1111-1111-111111111111',percentage:100}]}]}});
          }
          if (new URL(url).hostname === target.api + '.fixture.workers.dev' || new URL(url).hostname === target.web + '.fixture.workers.dev') {
            if (path === '/health') return Response.json({status:'ok'});
            if (path === '/') return new Response('<html>public</html>');
            if (options.method === 'OPTIONS') return new Response(null, {status:204,headers:{'Access-Control-Allow-Origin':'https://' + target.web + '.fixture.workers.dev','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'content-type'}});
            if (!options.headers?.['CF-Access-Client-Id']) return new Response(null,{status:302,headers:{Location:'https://fixture.cloudflareaccess.com/login'}});
            if (process.env.FAILURE === 'auth') return new Response(null,{status:403});
            if (path === '/dashboard/due-count') return Response.json({dueCount:1});
            if (path === '/answers') return Response.json({isCorrect:true});
            if (path === '/lesson-views') return Response.json({recorded:true},{status:201});
            if (['/home','/review','/domains','/analytics'].includes(path)) {
              const ray = (rays.length + 1).toString(16).padStart(16, '0');
              rays.push(ray);
              if (process.env.LATE === 'response' && rays.length === 40) return new Response(null,{status:302,headers:{Location:'https://fixture.cloudflareaccess.com/login'}});
              const rsc = options.headers?.RSC === '1';
              return new Response(rsc ? '0:["$"]' : '<html>Learning</html>',{headers:{'Content-Type':rsc ? 'text/x-component' : 'text/html','Cache-Control':'private, no-store','cf-ray':ray + '-NRT'}});
            }
          }
          throw new Error('Unexpected fixture network request');
        };
      `,
      )
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          join(root, 'network.mjs'),
          join(root, 'scripts/deployment.mjs'),
          'apply',
          environment,
        ],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            PATH: `${join(root, 'bin')}:${process.env.PATH}`,
            FAILURE: failure ?? '',
            LATE: late ?? '',
            PREVIOUS_CONTENT: previousContent ? '1' : '',
            GITHUB_REF: `refs/heads/${target.branch}`,
            GITHUB_EVENT_NAME: 'push',
            GITHUB_SHA: sha,
            GITHUB_RUN_ID: 'fixture',
            GITHUB_RUN_ATTEMPT: '1',
            GITHUB_REPOSITORY: 'test/fixture',
            GITHUB_TOKEN: 'fixture-token',
            DEPLOY_ACCOUNT_SUBDOMAIN: 'fixture',
            DEPLOY_ENABLED: failure === 'disabled' ? 'false' : 'true',
            PRODUCTION_VINEXT_READY: failure === 'vinext-not-ready' ? 'false' : 'true',
            CLOUDFLARE_ACCOUNT_ID: target.account,
            CLOUDFLARE_API_TOKEN: 'fixture-token',
            WEB_ORIGIN: `https://${target.web}.fixture.workers.dev`,
            ACCESS_ISSUER: 'https://fixture.cloudflareaccess.com',
            ACCESS_AUDIENCE: 'a'.repeat(64),
            CF_ACCESS_CLIENT_ID: 'fixture-client',
            CF_ACCESS_CLIENT_SECRET: 'fixture-secret',
            ...(failure === 'observability-token'
              ? {}
              : { CLOUDFLARE_OBSERVABILITY_API_TOKEN: 'fixture-observability-token' }),
          },
        },
      )
      assert.equal(
        result.status,
        failure || late ? 1 : 0,
        `${environment}/${failure}: ${result.stdout}\n${result.stderr}`,
      )
      const operation = JSON.parse(readFileSync(join(root, '.deploy/result.json'), 'utf8'))
      const records = () =>
        readFileSync(join(root, 'records.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
      if (late) {
        const done = ['preflight', 'migrations', 'sync', 'api', 'apiHealth', 'web', 'smoke']
        assert.deepEqual(operation.completed, late === 'response' ? done : [...done, 'performance'])
        assert.equal(operation.stage, late === 'response' ? 'performance' : 'cpuLogs')
        assert.throws(() => records(), 'no success record after a failed performance test')
        const report = JSON.parse(readFileSync(join(root, '.deploy/performance.json'), 'utf8'))
        assert.equal(report.status, 'failed')
        assert(report.runs.length > 0, 'partial results are kept')
        assert(!JSON.stringify(report).includes('fixture-secret'))
        assert(!JSON.stringify(report).includes('Learning'))
      } else if (failure) {
        assert.equal(result.status, 1, `${failure}: ${result.stderr}`)
        assert.deepEqual(operation.completed, [])
        assert.throws(() => readFileSync(join(root, 'commands.jsonl')))
      } else {
        assert.equal(result.status, 0, result.stderr)
        assert.equal(operation.success, true)
        const commands = readFileSync(join(root, 'commands.jsonl'), 'utf8')
          .trim()
          .split('\n')
          .map(JSON.parse)
        assert.deepEqual(
          commands.map((args, index) => args.slice(index === 3 ? 3 : 4, index === 3 ? 5 : 6)),
          [
            ['d1', 'migrations'],
            ['d1', 'execute'],
            ['deploy', '--config'],
            ['node', 'scripts/deploy.mjs'],
          ],
        )
        assert(commands[1].includes(join(release, 'content/sync.sql')))
        assert(commands[2].includes(join(release, 'api/wrangler.json')))
        assert(commands[3].includes('--upload-only'))
        assert(!commands.some((args) => args.includes('build')))
        const [record] = records()
        assert.equal(record.payload.runAttempt, '1')
        if (environment === 'verification') {
          assert.equal(record.payload.performance.passed, true)
          assert.equal(record.payload.performance.cpu.matched, 528)
          assert.equal(record.payload.performance.webVersion, record.payload.webVersion)
          assert.equal(record.payload.performance.tree, tree)
        } else assert.equal(record.payload.performance, undefined)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})
