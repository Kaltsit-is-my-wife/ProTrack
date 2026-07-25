# ELK.js 图形布局参考 (v0.11.1)

> **安装版本**: `elkjs` v0.11.1
> **官方仓库**: https://github.com/kieler/elkjs

---

## 1. 基本用法

```typescript
import ELK from 'elkjs';

const elk = new ELK();

const graph = {
  id: 'root',
  layoutOptions: {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
  },
  children: [
    { id: 'n1', width: 150, height: 50 },
    { id: 'n2', width: 150, height: 50 },
  ],
  edges: [
    { id: 'e1', sources: ['n1'], targets: ['n2'] },
  ],
};

const layoutedGraph = await elk.layout(graph);
// layoutedGraph.children[0].x, .y 包含计算后的位置
```

---

## 2. ELK Graph JSON 格式

### 完整类型定义（来自 `elk-api.d.ts`）

```typescript
interface ElkNode {
  id: string;                    // 唯一标识（必填）
  children?: ElkNode[];          // 子节点
  edges?: ElkExtendedEdge[];     // 本节点内部的边
  ports?: ElkPort[];             // 端口
  labels?: ElkLabel[];           // 标签
  layoutOptions?: LayoutOptions; // 局部布局选项
  x?: number;                    // 位置（layout 后填充）
  y?: number;
  width?: number;                // 尺寸（layout 前需要预设）
  height?: number;
}

interface ElkExtendedEdge {
  id: string;
  sources: string[];    // 源节点 ID 数组
  targets: string[];    // 目标节点 ID 数组
  sections?: ElkEdgeSection[];
  junctionPoints?: ElkPoint[];
}

interface ElkEdgeSection {
  id: string;
  startPoint: ElkPoint;
  endPoint: ElkPoint;
  bendPoints?: ElkPoint[];  // 弯曲点
}

interface ElkLabel {
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface LayoutOptions {
  [key: string]: string;  // 如 'elk.algorithm': 'layered'
}
```

---

## 3. 关键布局选项

### 算法选择
| 选项 | 值 | 说明 |
|------|----|----|
| `elk.algorithm` | `layered` | 层次布局（推荐用于思维导图） |
| | `force` | 力导向布局 |
| | `stress` | 应力布局 |
| | `tree` | 树形布局 |
| | `radial` | 径向布局 |

### 方向 (用于 layered/tree)
| 值 | 说明 |
|----|------|
| `DOWN` | 从上到下（思维导图推荐） |
| `RIGHT` | 从左到右 |
| `UP` | 从下到上 |
| `LEFT` | 从右到左 |

### 间距
| 选项 | 说明 | 推荐值 |
|------|------|--------|
| `elk.spacing.nodeNode` | 节点间距 | `40`-`80` |
| `elk.layered.spacing.nodeNodeBetweenLayers` | 层间距 | `100`-`200` |

### 层级处理
| 选项 | 值 | 说明 |
|------|----|----|
| `elk.hierarchyHandling` | `INCLUDE_CHILDREN` | 扁平化处理嵌套节点（关键选项） |

---

## 4. 思维导图布局示例

```typescript
import ELK from 'elkjs';

const elk = new ELK({
  defaultLayoutOptions: {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.spacing.nodeNode': '60',
    'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  },
});

async function layoutMindMap(rootDir: FileNode): Promise<ElkNode> {
  const elkGraph = convertToElkGraph(rootDir);

  const layouted = await elk.layout(elkGraph);

  // 将 ELK 结果转换为 React Flow 格式
  return layouted;
}

function convertToElkGraph(node: FileNode, depth: number, maxDepth: number): ElkNode {
  const elkNode: ElkNode = {
    id: node.id,
    width: 180,
    height: 40,
    labels: [{ text: node.name }],
  };

  if (depth < maxDepth && node.children && node.children.length > 0) {
    elkNode.children = node.children.map((child) =>
      convertToElkGraph(child, depth + 1, maxDepth)
    );
    elkNode.edges = node.children.map((child) => ({
      id: `${node.id}->${child.id}`,
      sources: [node.id],
      targets: [child.id],
    }));
  }

  return elkNode;
}
```

---

## 5. ELK → React Flow 转换

```typescript
interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

function elkToReactFlow(elkGraph: ElkNode): LayoutResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let positionOffset = { x: 0, y: 0 };

  function traverse(elkNode: ElkNode, parentId?: string) {
    nodes.push({
      id: elkNode.id,
      position: {
        x: elkNode.x! + positionOffset.x,
        y: elkNode.y! + positionOffset.y,
      },
      data: { label: elkNode.labels?.[0]?.text || elkNode.id },
      parentId, // v11.11 新属性名
    });

    if (elkNode.edges) {
      for (const edge of elkNode.edges) {
        for (const source of edge.sources) {
          for (const target of edge.targets) {
            edges.push({
              id: `${source}->${target}`,
              source,
              target,
              type: 'smoothstep',
            });
          }
        }
      }
    }

    if (elkNode.children) {
      for (const child of elkNode.children) {
        traverse(child, elkNode.id);
      }
    }
  }

  traverse(elkGraph);
  return { nodes, edges };
}
```

---

## 6. 重要注意事项

1. **必须先设 width/height**: ELK 需要在布局前知道每个节点的尺寸
2. **坐标相对性**: 子节点的 `x`/`y` 是相对于父节点，需要累加父节点位置得到绝对坐标
3. **`elk.hierarchyHandling`**: 处理嵌套结构时**必须**设置 `INCLUDE_CHILDREN`
4. **选项前缀**: 布局选项键必须加 `elk.` 前缀（如 `elk.algorithm`）
5. **edges 位置**: 连接同一父节点下子节点的边应放在该父节点的 `edges` 数组；跨层级边放在 root 的 `edges` 数组
6. **Worker 线程**: ELK 默认在 Web Worker 中运行，不阻塞 UI
