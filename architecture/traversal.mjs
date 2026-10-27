const terminalLayers = new Set(['shared-schema', 'shared-db'])

/** Shared by the CLI and viewer: traverse both directions without expanding contract hubs. */
export function expandSelection(graph, seeds, depth) {
  if (!Number.isInteger(depth) || depth < 0 || depth > 4)
    throw new Error('depth must be an integer from 0 to 4')
  const layers = new Map(graph.nodes.map((node) => [node.id, node.layer]))
  const seedIds = new Set(seeds)
  const selected = new Set(seedIds)
  const expands = (id) => seedIds.has(id) || !terminalLayers.has(layers.get(id))
  for (let i = 0; i < depth; i++) {
    const next = new Set(selected)
    for (const edge of graph.edges) {
      if (selected.has(edge.from) && expands(edge.from)) next.add(edge.to)
      if (selected.has(edge.to) && expands(edge.to)) next.add(edge.from)
    }
    for (const id of next) selected.add(id)
  }
  return selected
}
