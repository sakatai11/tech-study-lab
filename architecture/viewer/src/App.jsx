import {
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '@xyflow/react/dist/style.css'
import { laneOf, lanes, layoutGraph, nodeIcon, nodeLabel, selectGraph } from './graph-model.mjs'

function Icon({ name }) {
  return (
    <span className="icon" style={{ maskImage: `url(/icons/${name}.svg)` }} aria-hidden="true" />
  )
}

function CodeNode({ data, selected }) {
  const { node, seed } = data
  const file = node.source.file
  return (
    <div className={`code-node ${lanes[laneOf(node)].color} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <div className="node-heading">
        <Icon name={nodeIcon(node)} />
        <div>
          <span className="node-path" title={file}>
            {file.slice(0, file.lastIndexOf('/'))}/
          </span>
          <strong>{nodeLabel(node)}</strong>
        </div>
      </div>
      <div className="node-tags">
        <span className="tag">{node.layer}</span>
        {seed && <span className="match-label">検索一致</span>}
      </div>
      <div className="node-meta">
        <span>{node.kind}</span>
        <span>L{node.source.line}</span>
      </div>
    </div>
  )
}

function LaneNode({ data }) {
  const lane = lanes[data.index]
  return (
    <div className={`lane ${lane.color}`} style={{ height: data.height }}>
      <div className="lane-heading">
        <Icon name={lane.icon} />
        <div>
          <h2>{lane.name}</h2>
          <p>{lane.description}</p>
        </div>
        <span className="lane-count">{data.count}</span>
      </div>
      {!data.count && <p className="lane-empty">この範囲にノードはありません</p>}
    </div>
  )
}

const nodeTypes = { code: CodeNode, lane: LaneNode }
const edgeStyle = { stroke: '#8298af', strokeWidth: 1.4 }

function GraphBoard({ view, selectedId, onSelect }) {
  const flow = useReactFlow()
  const board = useRef(null)
  const initialized = useNodesInitialized()
  const readableView = useCallback(() => {
    const width = board.current?.clientWidth ?? 1400
    flow.setViewport({ x: 8, y: 8, zoom: Math.min(1, Math.max(0.65, (width - 16) / 1400)) })
  }, [flow])
  const layout = useMemo(() => layoutGraph(view), [view])
  const signature = view.nodes.map((node) => node.id).join('|')
  const handleNodeChanges = useCallback(
    (changes) => {
      const selection = changes.find(
        (change) => change.type === 'select' && change.selected && !change.id.startsWith('lane-'),
      )
      if (selection) onSelect(selection.id)
    },
    [onSelect],
  )
  const nodes = useMemo(
    () => [
      ...lanes.map((_, index) => ({
        id: `lane-${index}`,
        type: 'lane',
        position: { x: index * 354, y: 0 },
        data: { index, height: layout.height, count: layout.columns[index].length },
        style: { width: 338, height: layout.height },
        selectable: false,
        focusable: false,
        draggable: false,
      })),
      ...view.nodes.map((node) => ({
        id: node.id,
        type: 'code',
        position: layout.positions.get(node.id),
        data: { node, seed: view.seeds.has(node.id) },
        selected: node.id === selectedId,
        ariaLabel: `${nodeLabel(node)}、${node.layer}、${node.kind}`,
      })),
    ],
    [layout, view, selectedId],
  )
  const edges = useMemo(
    () =>
      view.edges.map((edge, index) => {
        const sameColumn = layout.positions.get(edge.from).x === layout.positions.get(edge.to).x
        const active = edge.from === selectedId || edge.to === selectedId
        return {
          id: `edge-${index}`,
          source: edge.from,
          target: edge.to,
          sourceHandle: sameColumn ? 'bottom' : 'right',
          targetHandle: sameColumn ? 'top' : 'left',
          type: 'smoothstep',
          label: edge.relation,
          markerEnd: { type: MarkerType.ArrowClosed, color: active ? '#a8d1ff' : '#8298af' },
          style: {
            ...edgeStyle,
            stroke: active ? '#a8d1ff' : '#8298af',
            opacity: selectedId && !active ? 0.38 : 1,
          },
          labelStyle: { fill: '#d2deed', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
          labelBgStyle: { fill: '#161f2b', fillOpacity: 1 },
          labelBgPadding: [6, 5],
          labelBgBorderRadius: 4,
          zIndex: active ? 3 : 1,
        }
      }),
    [view, layout, selectedId],
  )
  useEffect(() => {
    if (!signature || !initialized) return
    readableView()
    const observer = new ResizeObserver(readableView)
    observer.observe(board.current)
    return () => observer.disconnect()
  }, [signature, initialized, readableView])
  return (
    <div ref={board} className="graph-board" aria-label="レイヤー別の依存関係グラフ">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        panOnScroll
        zoomOnScroll={false}
        minZoom={0.15}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        onNodeClick={(_, node) => {
          if (node.type === 'code') onSelect(node.id)
        }}
        onNodesChange={handleNodeChanges}
        colorMode="dark"
        onlyRenderVisibleElements={false}
        ariaLabelConfig={{
          'node.a11yDescription.default': 'Enter または Space でノードを選択します。',
          'edge.a11yDescription.default': 'ノード間の構造上の関係です。',
        }}
      >
        <Panel position="bottom-left">
          <div className="canvas-tools">
            <button type="button" onClick={() => flow.zoomOut()}>
              縮小
            </button>
            <button type="button" onClick={() => flow.zoomIn()}>
              拡大
            </button>
            <button type="button" onClick={() => flow.fitView({ padding: 0.035, maxZoom: 1 })}>
              表示を合わせる
            </button>
            <button type="button" onClick={readableView}>
              読みやすいサイズ
            </button>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  )
}

function Inspector({ node, graph, snippet, onExplore }) {
  const [copyStatus, setCopyStatus] = useState('')
  if (!node)
    return (
      <section className="inspector empty-inspector">
        <h2>ノードを選択してください</h2>
        <p>出典と関連するノードをここに表示します。</p>
      </section>
    )
  const byId = new Map(graph.nodes.map((item) => [item.id, item]))
  const incoming = graph.edges.filter((edge) => edge.to === node.id)
  const outgoing = graph.edges.filter((edge) => edge.from === node.id)
  async function copySource() {
    try {
      await navigator.clipboard.writeText(`${node.source.file}:${node.source.line}`)
      setCopyStatus('コピーしました')
    } catch {
      setCopyStatus('コピーできませんでした。下の出典を選択してコピーしてください。')
    }
  }
  function relations(items, direction) {
    return (
      <div className="relation-group">
        <h3>
          {direction === 'in' ? 'このノードを参照' : 'このノードから参照'}{' '}
          <span>{items.length}</span>
        </h3>
        {items.length ? (
          items.map((edge, index) => {
            const other = byId.get(direction === 'in' ? edge.from : edge.to)
            return (
              <button
                type="button"
                className="relation-row"
                aria-label={`${nodeLabel(other)} ${edge.relation} を探索`}
                key={`${edge.from}-${edge.to}-${edge.relation}-${index}`}
                onClick={() => onExplore(other.id)}
                title={other.id}
              >
                <Icon name={nodeIcon(other)} />
                <span>
                  <strong>{nodeLabel(other)}</strong>
                  <small>
                    {edge.relation}
                    {edge.typeOnly ? ' · type-only' : ''}
                  </small>
                </span>
                <span className="relation-action">探索</span>
              </button>
            )
          })
        ) : (
          <p className="muted">抽出された関係はありません</p>
        )}
      </div>
    )
  }
  return (
    <section className="inspector" aria-label="選択中のノードの詳細">
      <div className="node-detail">
        <h2>選択中のノード</h2>
        <div className="detail-title">
          <Icon name={nodeIcon(node)} />
          <h3>{nodeLabel(node)}</h3>
        </div>
        <p className="file-path">{node.source.file}</p>
        <dl>
          <div>
            <dt>種類</dt>
            <dd>{node.kind}</dd>
          </div>
          <div>
            <dt>レイヤー</dt>
            <dd>
              <span className={`tag ${lanes[laneOf(node)].color}`}>{node.layer}</span>
            </dd>
          </div>
          <div>
            <dt>行番号</dt>
            <dd>L{node.source.line}</dd>
          </div>
        </dl>
        <button type="button" className="explore-button" onClick={() => onExplore(node.id)}>
          このノードを起点にする
        </button>
      </div>
      <div className="source-detail">
        <div className="section-heading">
          <h2>出典</h2>
          <button type="button" className="text-button" onClick={copySource}>
            パスをコピー
          </button>
        </div>
        <div className="source-block">
          <div className="source-file" title={node.source.file}>
            {node.source.file}
          </div>
          <pre aria-label="出典コード">
            <code>
              {snippet?.lines.map((line, index) => (
                <span
                  key={`${snippet.startLine + index}`}
                  className={`source-line ${snippet.startLine + index === node.source.line ? 'highlighted' : ''}`}
                >
                  <span className="line-number">{snippet.startLine + index}</span>
                  {line || ' '}
                </span>
              ))}
            </code>
          </pre>
        </div>
        <output className="copy-status">{copyStatus}</output>
      </div>
      <div className="relations-detail">
        <h2>
          関連ノード <span className="muted small">全関係</span>
        </h2>
        <div className="relations-scroll">
          {relations(incoming, 'in')}
          {relations(outgoing, 'out')}
        </div>
      </div>
    </section>
  )
}

export function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [text, setText] = useState('due-count')
  const [depth, setDepth] = useState(2)
  const [relation, setRelation] = useState('flow')
  const [focus, setFocus] = useState(null)
  const [selectedId, setSelectedId] = useState(
    'symbol:apps/api/src/services/review-service.ts#getDueCount',
  )
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`./graph-data.json?refresh=${reload}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const next = await response.json()
        if (!response.ok) throw new Error(next.error || 'Graph を読み込めませんでした。')
        if (!next.graph?.nodes || !next.graph?.edges || !next.snippets)
          throw new Error('Graph データの形式を確認してください。')
        setData(next)
      })
      .catch((cause) => {
        if (cause.name !== 'AbortError') {
          setError(cause.message)
          setData(null)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload])
  const view = useMemo(
    () => (data ? selectGraph(data.graph, { text, depth, relation, focus }) : null),
    [data, text, depth, relation, focus],
  )
  const selected =
    view?.nodes.find((node) => node.id === selectedId) ??
    view?.nodes.find((node) => view.seeds.has(node.id)) ??
    view?.nodes[0]
  const explore = useCallback(
    (id) => {
      setFocus(id)
      setText(nodeLabel(data.graph.nodes.find((node) => node.id === id)))
      setSelectedId(id)
    },
    [data],
  )
  function showAll() {
    setText('')
    setFocus(null)
    setSelectedId(null)
  }
  return (
    <main>
      <header className="app-header">
        <div className="brand">
          <Icon name="code" />
          <span>tech-study-lab</span>
          <span className="local-label">ローカルビューア</span>
        </div>
        <div className="title-row">
          <h1>Knowledge Graph</h1>
          <p>
            コードの関係をレイヤーで可視化し、ファイル・シンボル・エンドポイントのつながりを調べます。
          </p>
        </div>
      </header>
      <section className="toolbar" aria-label="グラフの検索と表示設定">
        <label className="search-field">
          <span className="sr-only">ファイル・シンボル・エンドポイントを検索</span>
          <input
            type="search"
            value={text}
            placeholder="ファイル・シンボル・エンドポイントを検索"
            onChange={(event) => {
              setText(event.target.value)
              setFocus(null)
            }}
          />
        </label>
        <div className="depth-control">
          <span id="depth-label">周辺の深さ</span>
          <fieldset className="segmented" aria-labelledby="depth-label">
            {[0, 1, 2, 3, 4].map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={depth === value}
                onClick={() => setDepth(value)}
              >
                {value}
              </button>
            ))}
          </fieldset>
        </div>
        <label className="relation-filter">
          <span>関係</span>
          <select
            aria-label="関係"
            value={relation}
            onChange={(event) => setRelation(event.target.value)}
          >
            <option value="flow">呼び出し・依存</option>
            <option value="all">すべて（import 含む）</option>
          </select>
        </label>
        <div className="toolbar-actions">
          <button type="button" onClick={showAll}>
            全体を見る
          </button>
          <button type="button" disabled={loading} onClick={() => setReload((value) => value + 1)}>
            {loading ? '読み込み中…' : '再読み込み'}
          </button>
        </div>
      </section>
      <div className="view-meta">
        <p>
          {focus
            ? '選択したノードを起点に表示'
            : text.trim()
              ? `「${text.trim()}」に一致するノードと周辺`
              : '抽出対象の全ノード'}
          <output className="view-count">
            {view ? `${view.nodes.length} ノード / ${view.edges.length} 関係` : ''}
          </output>
        </p>
        <p>ドラッグ・スクロールで移動できます。矢印は構造上の関係です。</p>
      </div>
      {error ? (
        <section className="empty-state" role="alert">
          <h2>Graph を読み込めませんでした</h2>
          <p>{error}</p>
          <button type="button" onClick={() => setReload((value) => value + 1)}>
            再試行
          </button>
        </section>
      ) : !view ? (
        <section className="empty-state" aria-live="polite">
          <h2>コードの構造を読み込んでいます</h2>
          <p>ファイル・型・エンドポイントの関係を準備しています。</p>
        </section>
      ) : !view.nodes.length ? (
        <section className="empty-state">
          <h2>一致するノードがありません</h2>
          <p>ファイル名や関数名の一部で検索してください。例: dashboard、ReviewDeps</p>
          <button type="button" onClick={showAll}>
            全体を見る
          </button>
        </section>
      ) : (
        <ReactFlowProvider>
          <GraphBoard view={view} selectedId={selected?.id} onSelect={setSelectedId} />
        </ReactFlowProvider>
      )}
      {data && (
        <Inspector
          key={selected?.id ?? 'empty'}
          node={selected}
          graph={data.graph}
          snippet={selected && data.snippets[selected.id]}
          onExplore={explore}
        />
      )}
      <footer>
        <p>Graph はコードから抽出した参照情報です。UI・教材など一部の領域は対象外です。</p>
        <span>
          {data &&
            `読み込み ${new Date(data.generatedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`}
        </span>
      </footer>
    </main>
  )
}
