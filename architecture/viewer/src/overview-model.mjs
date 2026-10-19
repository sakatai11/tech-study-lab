// Presentation groups only: preserve the extractor's layers and every node exactly once.
export const overviewLayers = [
  {
    id: 'web',
    name: '画面とのやり取り',
    description: '画面で使うデータを取得し、API に要求します。画面部品そのものは抽出対象外です。',
    layers: ['web-api', 'web-loader'],
    color: 'purple',
    icon: 'code',
  },
  {
    id: 'api',
    name: 'API の受付',
    description: '要求を受け付け、認証などの共通処理を通して担当の処理へ渡します。',
    layers: ['api-app', 'api-route', 'api-middleware'],
    color: 'green',
    icon: 'language',
  },
  {
    id: 'service',
    name: '業務の処理',
    description: '復習や解答など、アプリのルールに沿って処理します。',
    layers: ['api-service'],
    color: 'orange',
    icon: 'account_tree',
  },
  {
    id: 'data',
    name: 'データの読み書き',
    description: '業務の処理で必要なデータを取得・保存します。',
    layers: ['api-dal'],
    color: 'blue',
    icon: 'dns',
  },
  {
    id: 'db',
    name: 'DB の構造',
    description: '保存するデータのテーブルや項目を定義します。保存済みデータの表示ではありません。',
    layers: ['shared-db'],
    color: 'blue',
    icon: 'dns',
  },
  {
    id: 'shared',
    name: '共通のデータ定義',
    description: '複数の層で使う型や、データの入力条件を定義します。',
    layers: ['shared-domain', 'shared-schema'],
    color: 'purple',
    icon: 'category',
  },
  {
    id: 'config',
    name: '設定・その他',
    description: '実行環境の設定や接続先など、アプリ全体を支える情報です。',
    layers: ['config'],
    color: 'blue',
    icon: 'description',
  },
]
export function overviewGroup(node) {
  return overviewLayers.find((group) => group.layers.includes(node.layer))?.id ?? 'config'
}
export function summarizeLayers(graph) {
  const byId = new Map(graph.nodes.map((node) => [node.id, overviewGroup(node)]))
  return overviewLayers.map((group) => ({
    ...group,
    nodes: graph.nodes.filter((node) => byId.get(node.id) === group.id),
    connections: overviewLayers
      .filter((other) => other.id !== group.id)
      .map((other) => ({
        id: other.id,
        name: other.name,
        count: graph.edges.filter(
          (edge) =>
            (byId.get(edge.from) === group.id && byId.get(edge.to) === other.id) ||
            (byId.get(edge.to) === group.id && byId.get(edge.from) === other.id),
        ).length,
      }))
      .filter((connection) => connection.count > 0),
  }))
}
