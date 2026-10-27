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

/** Deterministic force layout: links attract, nodes repel; source layers remain intact. */
export function layoutGraph(graph) {
  const ordered = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id))
  const points = ordered.map((node, i) => ({
    id: node.id,
    x: Math.cos(i * 2.399963) * Math.sqrt(i + 1) * 90,
    y: Math.sin(i * 2.399963) * Math.sqrt(i + 1) * 70,
  }))
  const byId = new Map(points.map((point) => [point.id, point]))
  for (let step = 0; step < 160; step++) {
    const forces = new Map(
      points.map((point) => [point.id, { x: -point.x * 0.006, y: -point.y * 0.006 }]),
    )
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]
        const b = points[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distance = Math.max(1, Math.hypot(dx, dy))
        const strength = Math.min(45, 18000 / (distance * distance))
        const fx = (dx / distance) * strength
        const fy = (dy / distance) * strength
        forces.get(a.id).x += fx
        forces.get(a.id).y += fy
        forces.get(b.id).x -= fx
        forces.get(b.id).y -= fy
      }
    }
    for (const edge of graph.edges) {
      const a = byId.get(edge.from)
      const b = byId.get(edge.to)
      if (!a || !b || a === b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distance = Math.max(1, Math.hypot(dx, dy))
      const strength = (distance - 220) * 0.025
      const fx = (dx / distance) * strength
      const fy = (dy / distance) * strength
      forces.get(a.id).x += fx
      forces.get(a.id).y += fy
      forces.get(b.id).x -= fx
      forces.get(b.id).y -= fy
    }
    const cooling = 1 - step / 180
    for (const point of points) {
      const force = forces.get(point.id)
      point.x += Math.max(-25, Math.min(25, force.x)) * cooling
      point.y += Math.max(-25, Math.min(25, force.y)) * cooling
    }
  }
  // Resolve label collisions after cooling; node boxes are at most 260 x 32.
  for (let pass = 0; pass < 60; pass++) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]
        const b = points[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        if (Math.abs(dx) < 280 && Math.abs(dy) < 56) {
          const shift = (56 - Math.abs(dy)) / 2 + 1
          const direction = dy >= 0 ? 1 : -1
          a.y -= shift * direction
          b.y += shift * direction
        }
      }
    }
  }
  return { positions: new Map(points.map(({ id, x, y }) => [id, { x, y }])) }
}
