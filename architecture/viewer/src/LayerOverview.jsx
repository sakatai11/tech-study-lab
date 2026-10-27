import { useMemo, useState } from 'react'
import { nodeLabel } from './graph-model.mjs'
import { summarizeLayers } from './overview-model.mjs'

export function LayerOverview({ graph, onExplore }) {
  const groups = useMemo(() => summarizeLayers(graph), [graph])
  const [active, setActive] = useState(null)
  const [query, setQuery] = useState('')
  const selected = groups.find((group) => group.id === active)
  const nodes =
    selected?.nodes.filter((node) =>
      `${nodeLabel(node)} ${node.id}`.toLowerCase().includes(query.trim().toLowerCase()),
    ) ?? []
  function choose(id) {
    setActive(id)
    setQuery('')
  }
  return (
    <section className="layer-overview" aria-label="層別の概要">
      <div className="overview-intro">
        <p className="eyebrow">構造を知るところから</p>
        <h2>このアプリは、どこで何をしている？</h2>
        <p>まずは役割を選び、その中のファイルや関数から関係をたどれます。</p>
      </div>
      <h3 className="overview-section-title">
        主な役割 <span>番号順に読むと、役割の違いを理解できます</span>
      </h3>
      <div className="layer-cards">
        {groups.slice(0, 5).map((group, i) => (
          <button
            type="button"
            className={`layer-card ${group.color}`}
            key={group.id}
            aria-pressed={active === group.id}
            onClick={() => choose(group.id)}
          >
            <span className="layer-step">0{i + 1}</span>
            <h3>{group.name}</h3>
            <p>{group.description}</p>
            <span className="layer-count">{group.nodes.length} 件の構成要素を見る</span>
          </button>
        ))}
      </div>
      <p className="overview-note">
        この並びは役割を理解するための案内です。実際の呼び出し順序や、すべての層が直接つながることを示していません。
      </p>
      <div className="support-layers">
        {groups.slice(5).map((group) => (
          <button
            type="button"
            key={group.id}
            className={`layer-card ${group.color}`}
            aria-pressed={active === group.id}
            onClick={() => choose(group.id)}
          >
            <h3>{group.name}</h3>
            <p>{group.description}</p>
            <span className="layer-count">{group.nodes.length} 件の構成要素を見る</span>
          </button>
        ))}
      </div>
      {selected ? (
        <section className="layer-drilldown" aria-label={`${selected.name}の構成要素`}>
          <div className="drilldown-heading">
            <div>
              <h2>{selected.name}</h2>
              <p>項目を選ぶと、ネットワーク表示で出典と周辺の関係を確認できます。</p>
            </div>
            <label>
              この層を検索
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ファイル名・関数名"
              />
            </label>
          </div>
          <div className="layer-connections">
            <span>コードから抽出された他の層との関係（全種類・双方向）</span>
            {selected.connections.length ? (
              selected.connections.map((connection) => (
                <button type="button" key={connection.id} onClick={() => choose(connection.id)}>
                  {connection.name} · {connection.count} 件
                </button>
              ))
            ) : (
              <span>抽出された関係はありません</span>
            )}
          </div>
          <p className="muted">
            {nodes.length} / {selected.nodes.length} 件
          </p>
          <div className="overview-node-list">
            {nodes.map((node) => (
              <button type="button" key={node.id} onClick={() => onExplore(node.id)}>
                <strong>{nodeLabel(node)}</strong>
                <span>
                  {node.source.file}:{node.source.line}
                </span>
                <small>関係と出典を見る</small>
              </button>
            ))}
          </div>
          {!nodes.length && <p>一致する構成要素はありません。別の言葉で検索してください。</p>}
        </section>
      ) : (
        <div className="overview-start">上の役割を選ぶと、ここに構成要素を表示します。</div>
      )}
    </section>
  )
}
