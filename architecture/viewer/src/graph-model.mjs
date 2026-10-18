import { expandSelection } from '../../traversal.mjs'

export const lanes = [
  {
    name: 'Web フロントエンド',
    description: '画面のデータ取得・API 呼び出し',
    icon: 'code',
    color: 'purple',
  },
  {
    name: 'API エンドポイント',
    description: 'HTTP メソッドとパス',
    icon: 'language',
    color: 'green',
  },
  {
    name: 'API ルート / サービス',
    description: 'リクエスト処理とドメインロジック',
    icon: 'account_tree',
    color: 'orange',
  },
  {
    name: '共有 / データアクセス',
    description: '型・スキーマ・DB・設定',
    icon: 'dns',
    color: 'blue',
  },
]

export function laneOf(node) {
  if (node.kind === 'http-endpoint') return 1
  if (node.layer.startsWith('web-')) return 0
  if (node.layer.startsWith('api-') && node.layer !== 'api-dal') return 2
  return 3
}

export function nodeLabel(node) {
  if (node.kind === 'http-endpoint') return `${node.method} ${node.path}`
  if (node.id.startsWith('symbol:')) return node.id.split('#').at(-1)
  if (node.kind === 'worker-binding') return node.id.replace('binding:', '')
  return node.id.split('/').at(-1)
}

export function nodeIcon(node) {
  if (node.kind === 'http-endpoint') return 'language'
  if (node.kind === 'function') return 'code'
  if (node.kind === 'db-table' || node.kind === 'worker-binding') return 'dns'
  if (node.kind === 'module') return 'description'
  return 'category'
}

export function selectGraph(graph, { text = '', depth = 1, relation = 'all', focus = null } = {}) {
  const edges = graph.edges.filter((edge) =>
    relation === 'flow'
      ? !['imports', 'imports-symbol', 'derives-schema'].includes(edge.relation)
      : true,
  )
  const needle = text.trim().toLowerCase()
  const seeds = new Set(
    graph.nodes
      .filter((node) => (focus ? node.id === focus : node.id.toLowerCase().includes(needle)))
      .map((node) => node.id),
  )
  const selected = expandSelection({ nodes: graph.nodes, edges }, seeds, depth)
  return {
    nodes: graph.nodes.filter((node) => selected.has(node.id)),
    edges: edges.filter((edge) => selected.has(edge.from) && selected.has(edge.to)),
    seeds,
  }
}

/** Arrange real nodes into presentation lanes. Lane grouping never changes node.layer. */
export function layoutGraph(graph) {
  const columns = lanes.map(() => [])
  const distance = new Map([...graph.seeds].map((id) => [id, 0]))
  for (let step = 1; step <= 4; step++) {
    for (const edge of graph.edges) {
      if (distance.get(edge.from) === step - 1 && !distance.has(edge.to))
        distance.set(edge.to, step)
      if (distance.get(edge.to) === step - 1 && !distance.has(edge.from))
        distance.set(edge.from, step)
    }
  }
  const rank = (node) => (distance.get(node.id) ?? 5) * 10 + (node.kind === 'function' ? 0 : 1)
  for (const node of graph.nodes) columns[laneOf(node)].push(node)
  for (const column of columns) column.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))
  const positions = new Map()
  columns.forEach((column, lane) => {
    column.forEach((node, row) =>
      positions.set(node.id, { x: lane * 354 + 20, y: 100 + row * 184 }),
    )
  })
  return {
    columns,
    positions,
    height: Math.max(480, 120 + Math.max(...columns.map((column) => column.length)) * 184),
  }
}
