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
import { LayerOverview } from './LayerOverview.jsx'
import { laneOf, lanes, layoutGraph, nodeIcon, nodeLabel, selectGraph } from './graph-model.mjs'
import { parseGraphResponse } from './graph-response.mjs'

function Icon({ name }) {
  return (
    <span className="icon" style={{ maskImage: `url(/icons/${name}.svg)` }} aria-hidden="true" />
  )
}

function CodeNode({ data, selected }) {
  return (
    <div
      title={data.node.id}
      className={`code-node ${lanes[laneOf(data.node)].color} ${selected ? 'is-selected' : ''}`}
    >
      <Handle type="target" position={Position.Left} />
      <strong>{nodeLabel(data.node)}</strong>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
const nodeTypes = { code: CodeNode }
const colors = ['#ac7cf4', '#75cf88', '#f5a452', '#74b8f5']
function GraphBoard({ view, selectedId, onSelect }) {
  const flow = useReactFlow()
  const board = useRef(null)
  const initialized = useNodesInitialized()
  const layout = useMemo(() => layoutGraph(view), [view])
  const signature = view.nodes.map((node) => node.id).join('|')
  const nodes = useMemo(
    () =>
      view.nodes.map((node) => ({
        id: node.id,
        type: 'code',
        position: layout.positions.get(node.id),
        data: { node },
        selected: node.id === selectedId,
        ariaLabel: `${nodeLabel(node)}、${node.layer}、${node.kind}`,
      })),
    [view, layout, selectedId],
  )
  const edges = useMemo(
    () =>
      view.edges.map((edge, index) => {
        const active = edge.from === selectedId || edge.to === selectedId
        const color = colors[laneOf(view.nodes.find((node) => node.id === edge.from))]
        return {
          id: `edge-${index}`,
          source: edge.from,
          target: edge.to,
          type: 'default',
          label: active ? edge.relation : undefined,
          markerEnd: { type: MarkerType.ArrowClosed, color },
          style: { stroke: color, strokeWidth: active ? 1.6 : 0.8, opacity: active ? 0.9 : 0.26 },
          labelStyle: { fill: '#cad3df', fontSize: 10 },
          labelBgStyle: { fill: '#11151c' },
        }
      }),
    [view, selectedId],
  )
  useEffect(() => {
    if (!signature || !initialized) return
    const fit = () => flow.fitView({ padding: 0.18, maxZoom: 1.2 })
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(board.current)
    return () => observer.disconnect()
  }, [signature, initialized, flow])
  return (
    <div ref={board} className="graph-board" aria-label="ノードと関係のネットワークグラフ">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        minZoom={0.08}
        maxZoom={2.5}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        colorMode="dark"
        onNodeClick={(_, node) => onSelect(node.id)}
        onNodesChange={useCallback(
          (changes) => {
            const selected = changes.find((change) => change.type === 'select' && change.selected)
            if (selected) onSelect(selected.id)
          },
          [onSelect],
        )}
      >
        <Panel position="bottom-left">
          <div className="canvas-tools">
            <button type="button" onClick={() => flow.zoomIn()}>
              拡大
            </button>
            <button type="button" onClick={() => flow.zoomOut()}>
              縮小
            </button>
            <button type="button" onClick={() => flow.fitView({ padding: 0.18, maxZoom: 1.2 })}>
              表示を合わせる
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
  const [mode, setMode] = useState('overview')
  const [text, setText] = useState('')
  const [depth, setDepth] = useState(3)
  const [relation, setRelation] = useState('flow')
  const [focus, setFocus] = useState(null)
  const [categories, setCategories] = useState([true, true, true, true])
  const [selectedId, setSelectedId] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`./graph-data.json?refresh=${reload}`, { signal: controller.signal, cache: 'no-store' })
      .then(parseGraphResponse)
      .then(setData)
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
  const view = useMemo(() => {
    if (!data) return null
    const result = selectGraph(data.graph, { text, depth, relation, focus })
    const nodes = result.nodes.filter((node) => categories[laneOf(node)])
    const ids = new Set(nodes.map((node) => node.id))
    return {
      ...result,
      nodes,
      edges: result.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
    }
  }, [data, text, depth, relation, focus, categories])
  const selected =
    view?.nodes.find((node) => node.id === selectedId) ??
    view?.nodes.find((node) => view.seeds.has(node.id)) ??
    view?.nodes[0]
  const explore = useCallback(
    (id) => {
      setMode('network')
      setFocus(id)
      const category = laneOf(data.graph.nodes.find((node) => node.id === id))
      setCategories((values) => values.map((value, index) => index === category || value))
      setText(nodeLabel(data.graph.nodes.find((node) => node.id === id)))
      setSelectedId(id)
    },
    [data],
  )
  function showAll() {
    setText('')
    setFocus(null)
    setSelectedId(null)
    setCategories([true, true, true, true])
  }
  return (
    <main className={mode === 'overview' ? 'overview-mode' : 'network-mode'}>
      <header className="app-header">
        <Icon name="account_tree" />
        <h1>Knowledge Graph</h1>
      </header>
      <section className="toolbar" aria-label="グラフの検索と表示設定">
        {mode === 'overview' ? (
          <p className="overview-toolbar-note">役割から探す → 構成要素を選ぶ → 関係と出典を確認</p>
        ) : (
          <>
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
            <label className="depth-control">
              深さ{' '}
              <select
                aria-label="周辺の深さ"
                value={depth}
                onChange={(event) => setDepth(Number(event.target.value))}
              >
                {[0, 1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="relation-filter">
              <span>関係</span>
              <select
                aria-label="関係"
                value={relation}
                onChange={(event) => setRelation(event.target.value)}
              >
                <option value="flow">フロー</option>
                <option value="all">すべて（import 含む）</option>
              </select>
            </label>
          </>
        )}
        <div className="toolbar-actions">
          {mode === 'network' && (
            <button type="button" onClick={showAll}>
              全体を見る
            </button>
          )}
          <button type="button" disabled={loading} onClick={() => setReload((value) => value + 1)}>
            {loading ? '読み込み中…' : '再読み込み'}
          </button>
        </div>
      </section>
      <div className="view-meta">
        <nav className="view-switch" aria-label="表示方法">
          <button
            type="button"
            aria-pressed={mode === 'overview'}
            onClick={() => setMode('overview')}
          >
            層別の概要
          </button>
          <button
            type="button"
            aria-pressed={mode === 'network'}
            onClick={() => setMode('network')}
          >
            ネットワーク
          </button>
        </nav>
        {mode === 'network' && (
          <div className="category-filters" aria-label="表示カテゴリ">
            {lanes.map((lane, index) => (
              <button
                type="button"
                key={lane.color}
                className={lane.color}
                aria-pressed={categories[index]}
                onClick={() =>
                  setCategories((values) =>
                    values.map((value, i) => (i === index ? !value : value)),
                  )
                }
              >
                <Icon name={lane.icon} />
                {['Web', 'API', 'Services', 'Shared'][index]}
              </button>
            ))}
          </div>
        )}
        <output>
          {mode === 'overview'
            ? data
              ? `${data.graph.nodes.length} 件の構成要素`
              : ''
            : view
              ? `${view.nodes.length} ノード / ${view.edges.length} 関係`
              : ''}
        </output>
      </div>
      <div className={`workspace ${mode === 'overview' ? 'overview-workspace' : ''}`}>
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
        ) : mode === 'overview' ? (
          <LayerOverview graph={data.graph} onExplore={explore} />
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
        {data && mode === 'network' && (
          <Inspector
            key={selected?.id ?? 'empty'}
            node={selected}
            graph={data.graph}
            snippet={selected && data.snippets[selected.id]}
            onExplore={explore}
          />
        )}
      </div>
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
