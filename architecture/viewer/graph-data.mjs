import { extract, readSources } from '../../scripts/architecture.mjs'

/** Only the extractor's explicit source roots are read; no arbitrary path endpoint is exposed. */
export function createViewerData(root) {
  const sources = readSources(root)
  const graph = extract(sources)
  const snippets = Object.fromEntries(
    graph.nodes.map((node) => {
      const lines = sources[node.source.file].split('\n')
      const start = Math.max(0, node.source.line - 3)
      return [node.id, { startLine: start + 1, lines: lines.slice(start, start + 14) }]
    }),
  )
  return { graph, snippets, generatedAt: new Date().toISOString() }
}

export function graphDataPlugin(root) {
  return {
    name: 'architecture-graph-data',
    configureServer(server) {
      // Plugin middleware runs before Vite's own Host validation.
      const port = server.config.server.port
      const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
      server.middlewares.use('/graph-data.json', (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        if (request.method !== 'GET') {
          response.writeHead(405, { Allow: 'GET' })
          response.end(JSON.stringify({ error: 'GET only' }))
          return
        }
        if (!allowedHosts.has(request.headers.host)) {
          response.writeHead(403)
          response.end(JSON.stringify({ error: 'Loopback hosts only' }))
          return
        }
        const origin = request.headers.origin
        if (origin && origin !== `http://${request.headers.host}`) {
          response.writeHead(403)
          response.end(JSON.stringify({ error: 'Same-origin requests only' }))
          return
        }
        try {
          response.end(JSON.stringify(createViewerData(root)))
        } catch (error) {
          console.error('Graph extraction failed:', error.message)
          response.writeHead(500)
          response.end(
            JSON.stringify({
              error: 'Graph の抽出に失敗しました。起動中のターミナルで詳細を確認してください。',
            }),
          )
        }
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'graph-data.json',
        source: JSON.stringify(createViewerData(root)),
      })
    },
  }
}
