import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

/** Ontology: node kinds, symbol kinds and per-relation domain/range (architecture/README.md). */
const symbolKinds = ['db-table', 'contract-schema', 'deps-type', 'type', 'function', 'constant']
const nodeKinds = new Set(['module', 'http-endpoint', 'worker-binding', ...symbolKinds])
const relationSpec = {
  imports: { domain: ['module'], range: ['module'] },
  'imports-symbol': { domain: ['module'], range: symbolKinds },
  'calls-symbol': { domain: ['module'], range: ['function'] },
  'accepts-deps': { domain: ['function'], range: ['deps-type'] },
  'returns-deps': { domain: ['function'], range: ['deps-type'] },
  mounts: { domain: ['module'], range: ['module'] },
  implements: { domain: ['http-endpoint'], range: ['module'] },
  'calls-endpoint': { domain: ['module'], range: ['http-endpoint'] },
  'derives-schema': { domain: ['type'], range: ['db-table', 'contract-schema'] },
  'binds-service': { domain: ['module'], range: ['module'] },
  'binds-database': { domain: ['module'], range: ['worker-binding'] },
}
const fixedFiles = ['apps/api/wrangler.toml', 'apps/web/wrangler.jsonc', '.dependency-cruiser.cjs']
const roots = ['apps/api/src', 'apps/web/src', 'packages/shared/src']
const included = (file) =>
  /\.(ts|tsx)$/.test(file) &&
  !/\.test\.|\.d\.ts$|\/test\/|generated-content/.test(file) &&
  (!file.startsWith('apps/web/') ||
    /\/features\/[^/]+\/(api\/|server\/load-)|\/lib\/api\.ts$/.test(file))

/** Deterministic layer from path convention; every extracted file resolves to exactly one. */
export function layerOf(file) {
  if (file.startsWith('apps/api/src/routes/')) return 'api-route'
  if (file.startsWith('apps/api/src/services/')) return 'api-service'
  if (file.startsWith('apps/api/src/dal/')) return 'api-dal'
  if (file.startsWith('apps/api/src/middleware/')) return 'api-middleware'
  if (file.startsWith('apps/api/src/')) return 'api-app'
  if (file.startsWith('packages/shared/src/schema/')) return 'shared-schema'
  if (file.startsWith('packages/shared/src/db/')) return 'shared-db'
  if (file.startsWith('packages/shared/src/')) return 'shared-domain'
  if (/^apps\/web\/src\/features\/[^/]+\/server\/load-/.test(file)) return 'web-loader'
  if (/^apps\/web\/src\/features\/[^/]+\/api\//.test(file) || file === 'apps/web/src/lib/api.ts')
    return 'web-api'
  if (fixedFiles.includes(file)) return 'config'
  throw new Error(`Unclassified layer: ${file}`)
}

/** Deterministic symbol kind from syntax; db-table beats contract-schema, deps-type beats type. */
function symbolKind(node, sf) {
  if (ts.isFunctionDeclaration(node)) return 'function'
  if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node))
    return node.name.text.endsWith('Deps') ? 'deps-type' : 'type'
  const initializer = node.initializer
  if (
    initializer &&
    ts.isCallExpression(initializer) &&
    initializer.expression.getText(sf) === 'sqliteTable'
  )
    return 'db-table'
  if (initializer && /^z\b/.test(initializer.getText(sf))) return 'contract-schema'
  return node.name.text.endsWith('Schema') ? 'contract-schema' : 'constant'
}

/** Only explicit configuration and non-test source roots; symlinks are never followed. */
export function readSources(root) {
  const sources = {}
  const walk = (dir) => {
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = `${dir}/${entry.name}`
      if (entry.isDirectory() && !entry.name.startsWith('.')) walk(file)
      else if (entry.isFile() && included(file))
        sources[file] = readFileSync(path.join(root, file), 'utf8')
    }
  }
  for (const dir of roots) walk(dir)
  for (const file of fixedFiles) sources[file] = readFileSync(path.join(root, file), 'utf8')
  return sources
}

const digest = (text) => createHash('sha256').update(text).digest('hex')
const visit = (node, fn) => {
  fn(node)
  ts.forEachChild(node, (child) => visit(child, fn))
}
const literal = (node) => (node && ts.isStringLiteralLike(node) ? node.text : undefined)
const sourceAt = (sf, node) => ({
  file: sf.fileName,
  line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
})
function isHonoChain(node) {
  if (ts.isNewExpression(node))
    return ts.isIdentifier(node.expression) && node.expression.text === 'Hono'
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    isHonoChain(node.expression.expression)
  )
}

/** Limited TOML projection: root string keys and [[d1_databases]] string keys only. */
function workerConfig(text) {
  const result = { databases: [] }
  let section = result
  for (const line of text.split('\n')) {
    if (/^\s*\[/.test(line)) {
      section = /^\s*\[\[d1_databases\]\]\s*(?:#.*)?$/.test(line) ? {} : null
      if (section) result.databases.push(section)
      continue
    }
    if (!section) continue
    const match = line.match(/^\s*(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/)
    if (match)
      section[match[1]] = match[2][0] === '"' ? JSON.parse(match[2]) : match[2].slice(1, -1)
  }
  if (!result.name || !result.main || !result.databases.some((db) => db.binding === 'DB'))
    throw new Error('Unsupported/missing API worker name, main or DB binding')
  return result
}

function resolveImport(file, specifier, sources) {
  let target
  if (specifier.startsWith('.'))
    target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
  else if (specifier.startsWith('@/')) target = `apps/web/src/${specifier.slice(2)}`
  else
    target = {
      '@tsl/shared': 'packages/shared/src/index',
      '@tsl/shared/db': 'packages/shared/src/db/schema',
      '@tsl/shared/srs': 'packages/shared/src/srs/sm2',
      '@tsl/api/client': 'apps/api/src/client',
    }[specifier]
  if (!target) return undefined
  return [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`].find(
    (candidate) => candidate in sources,
  )
}

export function extract(sources) {
  const nodes = new Map()
  const edges = []
  const add = (id, kind, source, extra = {}) => {
    if (!nodes.has(id)) nodes.set(id, { id, kind, source, ...extra })
    return id
  }
  const edge = (from, relation, to, source, extra = {}) =>
    edges.push({ from, relation, to, source, ...extra })
  /** Containment is a node attribute, never an edge: it costs no query depth. */
  const declare = (file, name) => nodes.get(file).symbols.push(name)
  const files = Object.keys(sources).sort()
  for (const file of files)
    add(file, 'module', { file, line: 1 }, { layer: layerOf(file), symbols: [] })
  const parsed = new Map(
    files
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.cjs'))
      .map((file) => {
        const sf = ts.createSourceFile(file, sources[file], ts.ScriptTarget.Latest, true)
        if (sf.parseDiagnostics.length) throw new Error(`Cannot parse ${file}`)
        return [file, sf]
      }),
  )
  const imports = new Map()
  const symbols = new Map()
  const exportedSymbols = new Map()
  const sharedSymbol = (file, name) => {
    const direct = symbols.get(`${file}#${name}`)
    if (direct) return direct
    const candidates = exportedSymbols.get(name) ?? []
    if (candidates.length > 1) throw new Error(`Ambiguous shared symbol: ${name}`)
    return candidates[0]
  }
  const apiSymbols = new Map()
  for (const [file, sf] of parsed) {
    const named = new Map()
    imports.set(file, named)
    if (file.startsWith('packages/shared/')) {
      for (const statement of sf.statements) {
        const declarations = ts.isVariableStatement(statement)
          ? statement.declarationList.declarations
          : [statement]
        for (const node of declarations) {
          if (
            !(
              ts.isVariableDeclaration(node) ||
              ts.isTypeAliasDeclaration(node) ||
              ts.isInterfaceDeclaration(node) ||
              ts.isFunctionDeclaration(node)
            ) ||
            !node.name ||
            !ts.isIdentifier(node.name)
          )
            continue
          const key = `${file}#${node.name.text}`
          if (symbols.has(key)) throw new Error(`Duplicate shared declaration: ${key}`)
          const id = add(`symbol:${key}`, symbolKind(node, sf), sourceAt(sf, node), {
            layer: layerOf(file),
            declaration: node.getText(sf),
          })
          declare(file, node.name.text)
          symbols.set(key, id)
          if (
            statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
          ) {
            const candidates = exportedSymbols.get(node.name.text) ?? []
            exportedSymbols.set(node.name.text, [...candidates, id])
          }
        }
      }
    }
    if (/^apps\/api\/src\/(services|dal)\//.test(file)) {
      for (const node of sf.statements) {
        if (
          (ts.isFunctionDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isInterfaceDeclaration(node)) &&
          node.name
        ) {
          const id = add(
            `symbol:${file}#${node.name.text}`,
            symbolKind(node, sf),
            sourceAt(sf, node),
            {
              layer: layerOf(file),
            },
          )
          apiSymbols.set(`${file}#${node.name.text}`, id)
          declare(file, node.name.text)
        }
      }
    }
    visit(sf, (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        const specifier = literal(node.moduleSpecifier)
        const target = resolveImport(file, specifier ?? '', sources)
        if (!target) return
        edge(file, 'imports', target, sourceAt(sf, node), {
          specifier,
          typeOnly: node.isTypeOnly === true || node.importClause?.isTypeOnly === true,
        })
        const bindings = node.importClause?.namedBindings
        if (bindings && ts.isNamedImports(bindings))
          for (const binding of bindings.elements)
            named.set(binding.name.text, {
              target,
              name: binding.propertyName?.text ?? binding.name.text,
              node: binding,
            })
      }
    })
  }
  for (const [file, sf] of parsed) {
    const resolveApiSymbol = (name) => {
      const imported = imports.get(file).get(name)
      return apiSymbols.get(imported ? `${imported.target}#${imported.name}` : `${file}#${name}`)
    }
    for (const node of sf.statements) {
      if (!ts.isFunctionDeclaration(node) || !node.name) continue
      const from = apiSymbols.get(`${file}#${node.name.text}`)
      if (!from) continue
      const linkType = (type, relation) => {
        if (!type || !ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) return
        const target = resolveApiSymbol(type.typeName.text)
        if (target?.endsWith('Deps')) edge(from, relation, target, sourceAt(sf, type))
      }
      for (const parameter of node.parameters) linkType(parameter.type, 'accepts-deps')
      linkType(node.type, 'returns-deps')
    }
    if (file.startsWith('apps/api/src/routes/'))
      visit(sf, (node) => {
        if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return
        const imported = imports.get(file).get(node.expression.text)
        if (!imported) return
        const target = apiSymbols.get(`${imported.target}#${imported.name}`)
        if (target) edge(file, 'calls-symbol', target, sourceAt(sf, node))
      })
    for (const binding of imports.get(file).values()) {
      if (!binding.target.startsWith('packages/shared/')) continue
      const target = sharedSymbol(binding.target, binding.name)
      if (target) edge(file, 'imports-symbol', target, sourceAt(sf, binding.node))
    }
    if (file.startsWith('packages/shared/'))
      for (const node of sf.statements) {
        if (ts.isTypeAliasDeclaration(node))
          visit(node.type, (part) => {
            if (!ts.isTypeQueryNode(part)) return
            let root = part.exprName
            while (ts.isQualifiedName(root)) root = root.left
            if (!ts.isIdentifier(root)) return
            const binding = imports.get(file).get(root.text)
            const target = sharedSymbol(binding?.target ?? file, binding?.name ?? root.text)
            if (target)
              edge(
                symbols.get(`${file}#${node.name.text}`),
                'derives-schema',
                target,
                sourceAt(sf, part),
              )
          })
      }
  }
  const app = parsed.get('apps/api/src/app.ts')
  const mounted = [{ prefix: '', target: app.fileName }]
  visit(app, (node) => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isPropertyAccessExpression(node.expression) ||
      node.expression.name.text !== 'route'
    )
      return
    const prefix = literal(node.arguments[0])
    const expression = node.arguments[1]
    const name =
      expression && ts.isCallExpression(expression)
        ? expression.expression.getText(app)
        : expression?.getText(app)
    const target = imports.get(app.fileName).get(name)?.target
    if (!target) {
      if (prefix !== '/') throw new Error('Unsupported local/dynamic app mount')
      return
    }
    if (prefix === undefined) throw new Error('Unsupported dynamic mount path')
    mounted.push({ prefix, target })
    edge(app.fileName, 'mounts', target, sourceAt(app, node.expression.name), { prefix })
  })
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head'])
  for (const { prefix, target } of mounted)
    visit(parsed.get(target), (node) => {
      if (
        !ts.isCallExpression(node) ||
        !ts.isPropertyAccessExpression(node.expression) ||
        !methods.has(node.expression.name.text) ||
        !isHonoChain(node)
      )
        return
      const localPath = literal(node.arguments[0])
      if (localPath === undefined) throw new Error(`Unsupported dynamic route path in ${target}`)
      const method = node.expression.name.text.toUpperCase()
      const endpointPath =
        `${prefix}/${localPath}`.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'
      const source = sourceAt(parsed.get(target), node.expression.name)
      const id = add(`endpoint:${method} ${endpointPath}`, 'http-endpoint', source, {
        layer: layerOf(target),
        method,
        path: endpointPath,
      })
      edge(id, 'implements', target, source)
    })
  for (const [file, sf] of parsed)
    if (file.startsWith('apps/web/'))
      visit(sf, (node) => {
        if (
          !ts.isCallExpression(node) ||
          !ts.isPropertyAccessExpression(node.expression) ||
          !/^\$(get|post|put|patch|delete|options|head)$/.test(node.expression.name.text)
        )
          return
        const parts = []
        let current = node.expression.expression
        while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
          const segment = ts.isPropertyAccessExpression(current)
            ? current.name.text
            : literal(current.argumentExpression)
          if (segment === undefined) return
          parts.unshift(segment)
          current = current.expression
        }
        const endpoint = `endpoint:${node.expression.name.text.slice(1).toUpperCase()} /${parts.join('/')}`
        if (nodes.has(endpoint)) edge(file, 'calls-endpoint', endpoint, sourceAt(sf, node))
      })

  const api = workerConfig(sources['apps/api/wrangler.toml'])
  const config = ts.parseConfigFileTextToJson(
    'apps/web/wrangler.jsonc',
    sources['apps/web/wrangler.jsonc'],
  )
  if (config.error) throw new Error('Invalid Web JSONC')
  const binding = config.config.services?.filter((item) => item.binding === 'API')
  if (
    binding?.length !== 1 ||
    binding[0].service !== api.name ||
    binding[0].entrypoint !== 'InternalApi'
  )
    throw new Error('API Service binding mismatch')
  const entry = parsed.get(`apps/api/${api.main}`)
  const exported = entry?.statements.some(
    (statement) =>
      ts.isExportDeclaration(statement) &&
      literal(statement.moduleSpecifier) === './internal-api' &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause) &&
      statement.exportClause.elements.some(
        (item) =>
          item.name.text === binding[0].entrypoint &&
          (item.propertyName?.text ?? item.name.text) === 'InternalApi',
      ),
  )
  if (!exported) throw new Error('Missing InternalApi entrypoint export')
  const internal = parsed.get('apps/api/src/internal-api.ts')
  const declaration = internal?.statements.find(
    (statement) => ts.isClassDeclaration(statement) && statement.name?.text === 'InternalApi',
  )
  if (
    !declaration?.heritageClauses?.some((clause) =>
      clause.types.some((type) => type.expression.getText(internal) === 'WorkerEntrypoint'),
    )
  )
    throw new Error('Invalid InternalApi entrypoint class')
  const workerSource = {
    file: 'apps/web/wrangler.jsonc',
    line:
      sources['apps/web/wrangler.jsonc'].split('\n').findIndex((line) => line.includes('"API"')) +
      1,
  }
  edge('apps/web/wrangler.jsonc', 'binds-service', 'apps/api/src/internal-api.ts', workerSource, {
    binding: 'API',
    service: api.name,
    entrypoint: 'InternalApi',
  })
  const dbSource = {
    file: 'apps/api/wrangler.toml',
    line:
      sources['apps/api/wrangler.toml']
        .split('\n')
        .findIndex((line) => /binding\s*=\s*["']DB["']/.test(line)) + 1,
  }
  const db = add('binding:D1:DB', 'worker-binding', dbSource, {
    layer: 'config',
    name: api.databases.find((database) => database.binding === 'DB').database_name,
  })
  edge('apps/api/wrangler.toml', 'binds-database', db, dbSource)
  const rules = []
  visit(parsed.get('.dependency-cruiser.cjs'), (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText() === 'name' &&
      literal(node.initializer)
    )
      rules.push({
        name: literal(node.initializer),
        source: sourceAt(parsed.get('.dependency-cruiser.cjs'), node),
      })
  })
  const graph = {
    version: 2,
    sources: Object.fromEntries(
      files.map((file) => [
        file,
        { sha256: digest(sources[file]), lines: sources[file].split('\n').length },
      ]),
    ),
    nodes: [...nodes.values()]
      .map((node) => (node.symbols ? { ...node, symbols: [...node.symbols].sort() } : node))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    dependencyRules: rules,
  }
  validateGraph(graph)
  return graph
}

export function validateGraph(graph) {
  if (
    graph.version !== 2 ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    !graph.sources
  )
    throw new Error('Invalid graph schema')
  const ids = new Set(graph.nodes.map((node) => node.id))
  if (ids.size !== graph.nodes.length) throw new Error('Duplicate node')
  for (const [file, metadata] of Object.entries(graph.sources)) {
    if (
      file.includes('..') ||
      !(
        fixedFiles.includes(file) ||
        (roots.some((root) => file.startsWith(`${root}/`)) && included(file))
      ) ||
      !/^[a-f0-9]{64}$/.test(metadata.sha256) ||
      !Number.isInteger(metadata.lines) ||
      metadata.lines < 1
    )
      throw new Error('Invalid source manifest')
  }
  const provenance = (source) => {
    if (
      !source ||
      typeof source.file !== 'string' ||
      source.file.includes('..') ||
      !graph.sources[source.file] ||
      !Number.isInteger(source.line) ||
      source.line < 1 ||
      source.line > graph.sources[source.file].lines
    )
      throw new Error('Invalid source provenance')
  }
  const kindOf = new Map()
  for (const node of graph.nodes) {
    if (typeof node.id !== 'string' || !nodeKinds.has(node.kind)) throw new Error('Invalid node')
    if (node.layer !== layerOf(node.source?.file ?? ''))
      throw new Error(`Invalid layer: ${node.id}`)
    provenance(node.source)
    kindOf.set(node.id, node.kind)
  }
  // Containment: every symbol is declared by exactly its own module, and vice versa.
  const declared = new Set()
  for (const node of graph.nodes) {
    if (node.kind !== 'module') {
      if (node.symbols !== undefined) throw new Error(`Containment on non-module: ${node.id}`)
      continue
    }
    if (!Array.isArray(node.symbols)) throw new Error(`Missing containment: ${node.id}`)
    for (const name of node.symbols) declared.add(`symbol:${node.id}#${name}`)
  }
  for (const node of graph.nodes) {
    if (!symbolKinds.includes(node.kind)) continue
    if (!declared.delete(node.id)) throw new Error(`Undeclared symbol: ${node.id}`)
  }
  if (declared.size) throw new Error(`Declared symbol has no node: ${[...declared][0]}`)
  for (const edge of graph.edges) {
    const spec = relationSpec[edge.relation]
    if (!spec || !ids.has(edge.from) || !ids.has(edge.to))
      throw new Error('Unknown relation or dangling edge')
    if (!spec.domain.includes(kindOf.get(edge.from)) || !spec.range.includes(kindOf.get(edge.to)))
      throw new Error(`Relation ${edge.relation} violates domain/range: ${edge.from} -> ${edge.to}`)
    provenance(edge.source)
  }
}

export function assertFresh(saved, current) {
  validateGraph(saved)
  if (JSON.stringify(saved) !== JSON.stringify(current))
    throw new Error('Architecture snapshot is stale: run node scripts/architecture.mjs extract')
}

export function query(graph, needle, depth = 2) {
  if (!needle || !Number.isInteger(depth) || depth < 0 || depth > 4)
    throw new Error('query requires text and depth 0..4')
  const selected = new Set(
    graph.nodes.filter((node) => node.id.includes(needle)).map((node) => node.id),
  )
  if (selected.size === 0) throw new Error(`No architecture match: ${needle}`)
  for (let i = 0; i < depth; i++) {
    const next = new Set(selected)
    for (const edge of graph.edges)
      if (selected.has(edge.from) || selected.has(edge.to)) {
        next.add(edge.from)
        next.add(edge.to)
      }
    for (const id of next) selected.add(id)
  }
  return {
    nodes: graph.nodes
      .filter((node) => selected.has(node.id))
      .map(({ declaration, ...node }) => node),
    edges: graph.edges.filter((edge) => selected.has(edge.from) && selected.has(edge.to)),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [command, needle, depth] = process.argv.slice(2)
    const graph = extract(readSources(process.cwd()))
    const snapshot = 'architecture/graph.json'
    if (command === 'extract') {
      mkdirSync('architecture', { recursive: true })
      writeFileSync(snapshot, `${JSON.stringify(graph, null, 2)}\n`)
      console.log(`Saved ${snapshot}: ${graph.nodes.length} nodes, ${graph.edges.length} edges`)
    } else if (command === 'check') {
      assertFresh(JSON.parse(readFileSync(snapshot, 'utf8')), graph)
      console.log('Architecture snapshot and Worker bindings are consistent')
    } else if (command === 'query') {
      console.log(
        JSON.stringify(query(graph, needle, depth === undefined ? 2 : Number(depth)), null, 2),
      )
    } else
      throw new Error(
        'Usage: node scripts/architecture.mjs extract|check|query <endpoint-or-file> [depth 0..4]',
      )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
