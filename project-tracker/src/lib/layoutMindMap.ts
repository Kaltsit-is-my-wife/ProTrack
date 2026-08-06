// Copyright (C) 2026 Free Kaltsit-is-my-wife
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import ELK from "elkjs";
import type { ElkNode, ElkExtendedEdge } from "elkjs";
import type { Node, Edge } from "reactflow";
import type { DirNode } from "@/types/directory";
import { filterChildren } from "@/lib/filterRules";
import {
  MINDMAP_NODE_WIDTH,
  MINDMAP_NODE_HEIGHT,
  MINDMAP_MIN_NODE_GAP,
} from "@/lib/constants";

// ============================================================
// 布局选项
// ============================================================

const elk = new ELK({
  defaultLayoutOptions: {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT",
    "elk.spacing.nodeNode": "80",
    "elk.layered.spacing.nodeNodeBetweenLayers": "120",
    "elk.layered.spacing.baseValue": "40",
    "elk.spacing.edgeNode": "30",
    "elk.spacing.edgeEdge": "20",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  },
});

// ============================================================
// 类型
// ============================================================

/** 渲染到 React Flow node.data 中的负载 */
export interface MindMapNodeData {
  label: string;
  path: string;
  isDir: boolean;
  depth: number;
  childCount: number;
}

export interface LayoutOptions {
  /** 最大显示深度（0=仅根节点） */
  maxDepth: number;
  /**
   * 每个节点最多显示的子节点数。
   * 超出部分折叠为 "+N more" 占位节点。
   * undefined = 不限制（当前默认行为）
   */
  maxChildrenPerNode?: number;
  /** 是否启用本地过滤规则（默认 true） */
  enableFilter?: boolean;
  /** 用户手动删除/隐藏的文件：父目录路径 → 文件名列表 */
  hiddenFiles?: Record<string, string[]>;
  /** 同级节点间距 (px) */
  nodeSpacing?: number;
}

export interface LayoutResult {
  nodes: Node<MindMapNodeData>[];
  edges: Edge[];
  /** 被过滤的文件：父目录路径 → 文件路径列表 */
  hiddenFiles: Record<string, string[]>;
}

// ============================================================
// 默认导出
// ============================================================

const DEFAULT_OPTIONS: LayoutOptions = {
  maxDepth: 3,
  // maxChildrenPerNode 不设限制，留待后续启用
};

/**
 * 将 DirNode 树转换为 React Flow 节点和边（elkjs 布局）。
 *
 * @param tree   scan_directory 返回的目录树
 * @param opts   布局选项（maxDepth, maxChildrenPerNode）
 */
export async function layoutMindMap(
  tree: DirNode,
  opts: Partial<LayoutOptions> = {},
): Promise<LayoutResult> {
  const { maxDepth, maxChildrenPerNode, enableFilter, hiddenFiles: userHidden, nodeSpacing } = {
    ...DEFAULT_OPTIONS,
    ...opts,
  };

  // 1. 展平为 ELK 图（始终生成完整图，折叠由 React Flow hidden 属性控制）
  const doFilter = enableFilter !== false;
  const t0 = performance.now();
  const { graph: elkGraph, hidden: hiddenFiles } = buildElkGraph(
    tree,
    maxDepth,
    maxChildrenPerNode,
    doFilter,
    userHidden ?? {},
  );
  const t1 = performance.now();
  const nodeCount = (elkGraph.children ?? []).length;
  const edgeCount = (elkGraph.edges ?? []).length;
  const hiddenCount = Object.values(hiddenFiles).reduce((s, a) => s + a.length, 0);
  console.log(
    "[ELK:buildGraph]",
    nodeCount, "nodes,",
    edgeCount, "edges,",
    hiddenCount, "hidden",
    "| maxDepth:", maxDepth,
    "| took:", (t1 - t0).toFixed(0), "ms",
  );

  // 2. elkjs 布局（注入用户自定义节点间距）
  if (nodeSpacing != null) {
    elkGraph.layoutOptions = {
      ...(elkGraph.layoutOptions ?? {}),
      "elk.spacing.nodeNode": String(nodeSpacing),
    };
  }
  const t2 = performance.now();
  const layouted = await elk.layout(elkGraph);
  const t3 = performance.now();
  console.log("[ELK:layout] took:", (t3 - t2).toFixed(0), "ms", "| spacing:", nodeSpacing ?? "default");

  // 3. 后处理：强制同级节点最小垂直间距，消除重叠
  enforceMinSpacing(layouted, MINDMAP_MIN_NODE_GAP);
  console.log("[ELK:spacing] enforced min gap:", MINDMAP_MIN_NODE_GAP, "px");

  // 4. 转换为 React Flow 格式
  const { nodes, edges } = elkToReactFlow(layouted);
  console.log("[ELK:convert] React Flow nodes:", nodes.length, "edges:", edges.length);
  return { nodes, edges, hiddenFiles };
}

// ============================================================
// DirNode → 扁平 ELK Graph
// ============================================================

/**
 * 将 DirNode 树展平为 ELK 图。
 * 所有节点放在根级 children[]，所有边放在根级 edges[]。
 * 用纯边表达父子关系，避免嵌套层级导致的 hierarchy 问题。
 */
function buildElkGraph(
  tree: DirNode,
  maxDepth: number,
  maxChildrenPerNode?: number,
  enableFilter = true,
  userHidden: Record<string, string[]> = {},
): { graph: ElkNode; hidden: Record<string, string[]> } {
  const flatNodes: ElkNode[] = [];
  const flatEdges: ElkExtendedEdge[] = [];
  const hiddenFiles: Record<string, string[]> = {};

  function walk(node: DirNode, depth: number) {
    const rawChildren = node.children ?? [];

    // 本地过滤：自动生成 / 重复 / 系统残留 + 用户手动隐藏
    let usableChildren = rawChildren;

    // 1) 剔除用户手动隐藏的文件
    const userRemoved: string[] = [];
    const userSet = new Set(userHidden[node.path] ?? []);
    if (userSet.size > 0) {
      const kept: typeof rawChildren = [];
      for (const c of rawChildren) {
        if (userSet.has(c.name)) {
          userRemoved.push(c.name);
        } else {
          kept.push(c);
        }
      }
      usableChildren = kept;
    }

    // 2) 规则过滤（仅在启用且有剩余节点时）
    let ruleRemoved: string[] = [];
    if (enableFilter && usableChildren.length > 0) {
      const filtered = filterChildren(usableChildren);
      usableChildren = filtered.kept;
      ruleRemoved = filtered.removed;
    }

    // 3) 无论哪种来源，只要本目录下有被隐藏的文件就记录下来
    const removedTotal = [...userRemoved, ...ruleRemoved];
    if (removedTotal.length > 0) {
      hiddenFiles[node.path] = removedTotal;
    }

    const children = depth < maxDepth ? usableChildren : [];
    const visible = limitChildren(children, maxChildrenPerNode);

    // 当前节点（layoutOptions 携带 is_dir + 精确深度）
    flatNodes.push({
      id: node.path,
      width: MINDMAP_NODE_WIDTH,
      height: MINDMAP_NODE_HEIGHT,
      labels: [{ text: node.name }],
      layoutOptions: { isDir: node.isDir ? "true" : "false", depth: String(depth) },
    });

    // 如果当前目录有被过滤掉/手动隐藏的文件，追加 "已隐藏 N 个" 节点
    // 遵循与普通子节点相同的深度规则：仅当 depth < maxDepth 时子节点可见
    const removedCount = hiddenFiles[node.path]?.length ?? 0;
    if (removedCount > 0 && depth < maxDepth) {
      const hiddenId = `${node.path}::__hidden__`;
      flatNodes.push({
        id: hiddenId,
        width: MINDMAP_NODE_WIDTH,
        height: MINDMAP_NODE_HEIGHT,
        labels: [{ text: `已隐藏 ${removedCount} 个` }],
        layoutOptions: { isDir: "false", isHidden: "true", depth: String(depth + 1) },
      });
      flatEdges.push({
        id: `${node.path}->${hiddenId}`,
        sources: [node.path],
        targets: [hiddenId],
      });
    }

    // 边：当前节点 → 每个可见子节点
    for (const child of visible) {
      flatEdges.push({
        id: `${node.path}->${child.path}`,
        sources: [node.path],
        targets: [child.path],
      });
    }

    // 超出限制时追加 "+N more" 占位
    if (maxChildrenPerNode != null && children.length > maxChildrenPerNode) {
      const remaining = children.length - maxChildrenPerNode;
      const moreId = `${node.path}::__more__`;
      flatNodes.push({
        id: moreId,
        width: MINDMAP_NODE_WIDTH,
        height: MINDMAP_NODE_HEIGHT,
        labels: [{ text: `+${remaining} more` }],
      });
      flatEdges.push({
        id: `${node.path}->${moreId}`,
        sources: [node.path],
        targets: [moreId],
      });
    }

    // 递归子节点
    for (const child of visible) {
      walk(child, depth + 1);
    }
  }

  walk(tree, 0);

  return {
    graph: {
      id: "root",
      children: flatNodes,
      edges: flatEdges,
    },
    hidden: hiddenFiles,
  };
}

// ============================================================
// ELK Graph → React Flow
// ============================================================

function elkToReactFlow(elkGraph: ElkNode): Omit<LayoutResult, "hiddenFiles"> {
  const nodes: Node<MindMapNodeData>[] = [];
  const edges: Edge[] = [];

  // 统计每个目录的子节点数
  const childCounts = new Map<string, number>();
  for (const e of elkGraph.edges ?? []) {
    for (const s of e.sources) {
      childCounts.set(s, (childCounts.get(s) ?? 0) + e.targets.length);
    }
  }

  // elkGraph.children 是扁平列表，x/y 已是绝对坐标
  for (const elkNode of elkGraph.children ?? []) {
    // 深度从 layoutOptions 读取（walk 时精确记录，不依赖路径分隔符推断）
    const depth = Number(elkNode.layoutOptions?.depth ?? 0);

    nodes.push({
      id: elkNode.id,
      type: elkNode.layoutOptions?.["isHidden"] === "true" ? "hiddenMarker" : "mindmap",
      position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
      data: {
        label: elkNode.labels?.[0]?.text ?? elkNode.id,
        path: elkNode.id,
        // 用 layoutOptions 携带的原始 isDir，不依赖 edge（折叠后 edge 会消失）
        isDir: elkNode.layoutOptions?.["isDir"] === "true",
        depth: Math.max(0, depth),
        childCount: childCounts.get(elkNode.id) ?? 0,
      },
    });
  }

  for (const edge of elkGraph.edges ?? []) {
    for (const source of edge.sources) {
      for (const target of edge.targets) {
        edges.push({
          id: `${source}->${target}`,
          source,
          target,
          type: "default",
          animated: false,
          style: { stroke: "hsl(var(--border))", strokeWidth: 1.5 },
        });
      }
    }
  }

  return { nodes, edges };
}

// ============================================================
// 后处理：强制同级节点最小间距
// ============================================================

/**
 * 按深度分组，确保每组内相邻节点之间有至少 `minGap` 的垂直间距。
 * 直接修改 elkNode.children 中的 x/y。
 */
function enforceMinSpacing(root: ElkNode, minGap: number) {
  const children = root.children;
  if (!children || children.length === 0) return;

  // 1. 按深度分组（使用 layoutOptions 中的精确深度）
  const byDepth = new Map<number, ElkNode[]>();
  for (const node of children) {
    const d = Number(node.layoutOptions?.depth ?? 0);
    const list = byDepth.get(d) || [];
    list.push(node);
    byDepth.set(d, list);
  }

  // 2. 每组按 y 排序，推开太近的节点
  for (const [, group] of byDepth) {
    group.sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1];
      const curr = group[i];
      const prevBottom = (prev.y ?? 0) + (prev.height ?? MINDMAP_NODE_HEIGHT);
      const currTop = curr.y ?? 0;
      const gap = currTop - prevBottom;

      if (gap < minGap) {
        // 把当前节点及后面所有同级节点向下推
        const shift = minGap - gap;
        for (let j = i; j < group.length; j++) {
          group[j].y = (group[j].y ?? 0) + shift;
        }
      }
    }
  }
}

// ============================================================
// 工具 — 子节点裁剪
// ============================================================

function limitChildren<T>(children: T[], max?: number): T[] {
  if (max == null || children.length <= max) return children;
  return children.slice(0, max);
}
