# React Flow API 参考 (v11.11.4)

> **安装版本**: `reactflow` v11.11.4 (npm), `@reactflow/core` v11.11.4
> **官方文档**: https://v11.reactflow.dev/
> **重要**: v12 已发布为 `@xyflow/react`，本项目使用的是 `reactflow` v11，API 不同！

---

## 1. 核心组件

### `<ReactFlow>` Props（精选）

```typescript
import { ReactFlow, type Node, type Edge } from 'reactflow';

// 从 @reactflow/core/dist/esm/types/component-props.d.ts
```

| Prop | 类型 | 说明 |
|------|------|------|
| `nodes` / `edges` | `Node[]` / `Edge[]` | 受控模式的节点和边 |
| `defaultNodes` / `defaultEdges` | `Node[]` / `Edge[]` | 非受控模式的初始数据 |
| `nodeTypes` | `NodeTypes` | 自定义节点类型映射 |
| `edgeTypes` | `EdgeTypes` | 自定义边类型映射 |
| `fitView` | `boolean` | 初始自动适配视窗 |
| `fitViewOptions` | `FitViewOptions` | 适配选项（padding等） |
| `minZoom` / `maxZoom` | `number` | 缩放范围 |
| `defaultViewport` | `{ x, y, zoom }` | 初始视口 |
| `nodesDraggable` | `boolean` | 节点是否可拖拽（默认 true） |
| `nodesConnectable` | `boolean` | 节点是否可连线（默认 true） |
| `elementsSelectable` | `boolean` | 元素是否可选（默认 true） |
| `panOnDrag` | `boolean \| number[]` | 拖拽画布平移 |
| `zoomOnScroll` | `boolean` | 滚轮缩放（默认 true） |
| `zoomOnDoubleClick` | `boolean` | 双击缩放（默认 true） |
| `panOnScroll` | `boolean` | 滚轮平移 |
| `preventScrolling` | `boolean` | 阻止页面滚动（默认 true） |
| `connectionMode` | `'strict' \| 'loose'` | 连线模式 |
| `connectionLineType` | `ConnectionLineType` | 连线样式 |
| `snapToGrid` | `boolean` | 吸附网格 |
| `snapGrid` | `[number, number]` | 网格大小 |
| `deleteKeyCode` | `KeyCode \| null` | 删除快捷键 |
| `multiSelectionKeyCode` | `KeyCode \| null` | 多选快捷键 |
| `onNodeClick` / `onNodeDoubleClick` | `NodeMouseHandler` | 节点点击事件 |
| `onNodeDragStart` / `onNodeDrag` / `onNodeDragStop` | `NodeDragHandler` | 节点拖拽事件 |
| `onConnect` | `OnConnect` | 连线创建回调 |
| `onInit` | `OnInit` | 初始化回调，返回 `ReactFlowInstance` |
| `nodeOrigin` | `[number, number]` | 节点原点（默认 `[0, 0]`） |

---

## 2. Node 类型

```typescript
// 来自 @reactflow/core/dist/esm/types/nodes.d.ts

type Node<T = any, U extends string | undefined = string | undefined> = {
  id: string;                    // 唯一标识（必填）
  position: { x: number; y: number }; // 位置（必填）
  data: T;                       // 自定义数据（必填）
  type?: U;                      // 节点类型（自定义时指定）
  style?: CSSProperties;
  className?: string;
  sourcePosition?: Position;     // 'left' | 'right' | 'top' | 'bottom'
  targetPosition?: Position;
  hidden?: boolean;
  selected?: boolean;
  draggable?: boolean;
  selectable?: boolean;
  connectable?: boolean;
  deletable?: boolean;
  parentId?: string;             // 子节点（v11.11 新名称，v12 强制）
  // ⚠️ parentNode 已废弃
  width?: number | null;
  height?: number | null;
  zIndex?: number;
  extent?: 'parent' | CoordinateExtent;
};
```

**最小节点定义**:
```typescript
const node: Node = {
  id: 'node-1',
  position: { x: 0, y: 0 },
  data: { label: 'My Node' },
};
```

---

## 3. Edge 类型

```typescript
type Edge<T = any> = {
  id: string;         // 唯一标识
  source: string;     // 源节点 ID
  target: string;     // 目标节点 ID
  type?: string;      // 'default' | 'straight' | 'step' | 'smoothstep' | 'simplebezier'
  animated?: boolean;
  style?: CSSProperties;
  className?: string;
  markerStart?: EdgeMarkerType;
  markerEnd?: EdgeMarkerType;
  data?: T;
  // ⚠️ updatable 已废弃，使用 reconnectable
  reconnectable?: boolean | HandleType;
};
```

**内置边类型**: `BezierEdge`(默认), `StraightEdge`, `StepEdge`, `SmoothStepEdge`, `SimpleBezierEdge`

**路径工具函数**（可用于自定义边）:
```typescript
import { getBezierPath, getSmoothStepPath, getStraightPath } from 'reactflow';
```

---

## 4. Hooks

### `useReactFlow()` — 最重要的 Hook
返回 `ReactFlowInstance`，提供所有命令式操作：

```typescript
import { useReactFlow } from 'reactflow';

function MyComponent() {
  const reactFlow = useReactFlow();

  // 节点操作
  reactFlow.getNode('node-1');
  reactFlow.getNodes();
  reactFlow.addNodes([newNode]);
  reactFlow.setNodes((nodes) => [...nodes, newNode]);

  // 边操作
  reactFlow.getEdge('edge-1');
  reactFlow.getEdges();
  reactFlow.addEdges([newEdge]);
  reactFlow.setEdges((edges) => [...edges, newEdge]);

  // 删除
  reactFlow.deleteElements({ nodes: [{ id: 'node-1' }] });

  // 视口控制
  reactFlow.zoomIn();
  reactFlow.zoomOut();
  reactFlow.zoomTo(1.5);
  reactFlow.fitView({ padding: 0.2 });
  reactFlow.setCenter(100, 100, { zoom: 1, duration: 300 });
  reactFlow.getZoom();

  // 坐标转换
  reactFlow.screenToFlowPosition({ x: 100, y: 100 });
  reactFlow.flowToScreenPosition({ x: 200, y: 300 });

  // 序列化
  reactFlow.toObject(); // → { nodes, edges, viewport }
}
```

### `useNodesState()` / `useEdgesState()`
```typescript
import { useNodesState, useEdgesState } from 'reactflow';

const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

// 必须传给 ReactFlow:
<ReactFlow
  nodes={nodes}
  edges={edges}
  onNodesChange={onNodesChange}
  onEdgesChange={onEdgesChange}
/>
```

---

## 5. 自定义节点

```typescript
import { Handle, Position, type NodeProps } from 'reactflow';

// NodeProps 类型：
// { id, data, type, selected, isConnectable, xPos, yPos, zIndex, dragging, sourcePosition?, targetPosition? }

function CustomNode({ data, selected }: NodeProps) {
  return (
    <div className={selected ? 'ring-2 ring-blue-500' : ''}>
      <Handle type="target" position={Position.Top} />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// 注册
const nodeTypes = { custom: CustomNode };

<ReactFlow nodeTypes={nodeTypes} nodes={nodes} edges={edges} />
```

---

## 6. ReactFlowProvider（在 ReactFlow 外部使用 hooks）

```typescript
import { ReactFlowProvider, useReactFlow } from 'reactflow';

function FlowWithProvider() {
  return (
    <ReactFlowProvider>
      <Toolbar />      {/* 内部可以使用 useReactFlow() */}
      <ReactFlow nodes={nodes} edges={edges} />
    </ReactFlowProvider>
  );
}
```

---

## 7. 关键变化 (v11.11)

| 变更 | 旧 API | 新 API |
|------|--------|--------|
| 父节点引用 | `parentNode` (废弃中) | `parentId` |
| 边更新 | `onEdgeUpdate` (废弃中) | `onReconnect` |
| 边可重连 | `edgesUpdatable` (废弃中) | `reconnectable` |
| 投影方法 | `project()` (废弃中) | `screenToFlowPosition()` |
