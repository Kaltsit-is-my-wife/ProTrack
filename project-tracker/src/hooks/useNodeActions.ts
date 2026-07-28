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

import { useCallback, useState } from "react";
import type { Node, Edge, OnSelectionChangeFunc } from "reactflow";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/store/useAppStore";
import type { MindMapNodeData } from "@/lib/layoutMindMap";

interface UseNodeActionsOptions {
  hiddenFiles: Record<string, string[]>;
  setHiddenFiles: (map: Record<string, string[]>) => void;
  setNodes: React.Dispatch<React.SetStateAction<Node<MindMapNodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onOpenHiddenDialog: (path: string) => void;
}

export function useNodeActions({
  hiddenFiles,
  setHiddenFiles,
  setNodes,
  setEdges,
  onOpenHiddenDialog,
}: UseNodeActionsOptions) {
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);

  const handleSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selected }) => setSelectedNodes(selected),
    [],
  );

  // 删除节点 → 加入 hiddenFiles
  const handleNodesDelete = useCallback(
    (deleted: Node[]) => {
      const store = useAppStore.getState();
      const active = store.activeProjectId
        ? store.projects.find((p) => p.id === store.activeProjectId)
        : null;
      const rootPath = active?.path;

      const updated = { ...hiddenFiles };
      for (const node of deleted) {
        if (node.type === "hiddenMarker") continue;
        // 根节点不允许删除
        if (rootPath && (node.data as MindMapNodeData).path === rootPath)
          continue;
        const fullPath = (node.data as MindMapNodeData).path;
        const lastSep = Math.max(
          fullPath.lastIndexOf("\\"),
          fullPath.lastIndexOf("/"),
        );
        const parentDir = fullPath.substring(0, lastSep);
        const fileName = fullPath.substring(lastSep + 1);
        const list = updated[parentDir] ?? [];
        if (!list.includes(fileName)) {
          updated[parentDir] = [...list, fileName];
        }
      }
      setHiddenFiles(updated);
    },
    [hiddenFiles, setHiddenFiles],
  );

  // 删除按钮：删除当前选中的节点（跳过 hiddenMarker 和根节点）
  const handleDeleteSelected = useCallback(() => {
    const store = useAppStore.getState();
    const active = store.activeProjectId
      ? store.projects.find((p) => p.id === store.activeProjectId)
      : null;
    const rootPath = active?.path;
    const targets = selectedNodes.filter(
      (n) =>
        n.type !== "hiddenMarker" &&
        (n.data as MindMapNodeData).path !== rootPath,
    );
    if (targets.length === 0) return;
    console.log("[Delete] 删除选中节点 | count:", targets.length);
    setNodes((nds) =>
      nds.filter((n) => !targets.some((s) => s.id === n.id)),
    );
    setEdges((eds) =>
      eds.filter(
        (e) =>
          !targets.some((s) => s.id === e.source || s.id === e.target),
      ),
    );
    handleNodesDelete(targets);
    setSelectedNodes([]);
  }, [selectedNodes, setNodes, setEdges, handleNodesDelete]);

  // 双击节点 → 在文件管理器中打开
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node<MindMapNodeData>) => {
      if (node.type === "hiddenMarker") {
        // 提取父目录路径（去掉 ::__hidden__ 后缀）
        const parentPath = node.data.path.replace("::__hidden__", "");
        onOpenHiddenDialog(parentPath);
        return;
      }
      invoke("open_in_explorer", { path: node.data.path }).catch((err) =>
        console.error("打开目录失败:", err),
      );
    },
    [onOpenHiddenDialog],
  );

  return {
    handleNodesDelete,
    handleDeleteSelected,
    handleNodeDoubleClick,
    selectedNodes,
    handleSelectionChange,
  };
}
