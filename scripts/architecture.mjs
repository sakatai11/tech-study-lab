import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const relations = new Set([
  'calls-symbol',
  'accepts-deps',
  'returns-deps',
  'imports',
  'mounts',
  'implements',
  'calls-endpoint',
  'derives-schema',
  'uses-symbol',
  'binds',
])
const fixedFiles = ['apps/api/wrangler.toml', 'apps/web/wrangler.jsonc', '.dependency-cruiser.cjs']
const roots = ['apps/api/src', 'apps/web/src', 'packages/shared/src']
const included = (file) =>
  /\.(ts|tsx)$/.test(file) &&
  !/\.test\.|\.d\.ts$|\/test\/|generated-content/.test(file) &&
  (!file.startsWith('apps/web/') ||
    /\/features\/[^/]+\/(api\/|server\/load-)|\/lib\/api\.ts$/.test(file))

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
  const files = Object.keys(sources).sort()
  for (const file of files) add(file, 'file', { file, line: 1 })
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
          const id = add(`symbol:${key}`, 'symbol', sourceAt(sf, node), {
            declaration: node.getText(sf),
          })
          symbols.set(key, id)
          if (
            statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
          ) {
            const candidates = exportedSymbols.get(node.name.text) ?? []
            exportedSymbols.set(node.name.text, [...candidates, id])
          }
          edge(file, 'implements', id, sourceAt(sf, node))
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
          const id = add(`symbol:${file}#${node.name.text}`, 'symbol', sourceAt(sf, node))
          apiSymbols.set(`${file}#${node.name.text}`, id)
          edge(file, 'implements', id, sourceAt(sf, node))
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
      if (target) edge(file, 'uses-symbol', target, sourceAt(sf, binding.node))
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
      const id = add(`endpoint:${method} ${endpointPath}`, 'endpoint', source, {
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
  edge('apps/web/wrangler.jsonc', 'binds', 'apps/api/src/internal-api.ts', workerSource, {
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
  const db = add('binding:D1:DB', 'binding', dbSource, {
    name: api.databases.find((database) => database.binding === 'DB').database_name,
  })
  edge('apps/api/wrangler.toml', 'binds', db, dbSource)
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
    version: 1,
    sources: Object.fromEntries(
      files.map((file) => [
        file,
        { sha256: digest(sources[file]), lines: sources[file].split('\n').length },
      ]),
    ),
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    dependencyRules: rules,
  }
  validateGraph(graph)
  return graph
}

export function validateGraph(graph) {
  if (
    graph.version !== 1 ||
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
  for (const node of graph.nodes) {
    if (
      typeof node.id !== 'string' ||
      !['file', 'symbol', 'endpoint', 'binding'].includes(node.kind)
    )
      throw new Error('Invalid node')
    provenance(node.source)
  }
  for (const edge of graph.edges) {
    if (!relations.has(edge.relation) || !ids.has(edge.from) || !ids.has(edge.to))
      throw new Error('Unknown relation or dangling edge')
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
