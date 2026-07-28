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

import { Handle, Position, type NodeProps } from "reactflow";
import { useAppStore } from "@/store/useAppStore";
import type { MindMapNodeData } from "@/lib/layoutMindMap";

// ============================================================
// MindMapNode — 自定义思维导图节点
// ============================================================
export function MindMapNode({ data, selected }: NodeProps<MindMapNodeData>) {
  const collapsedPaths = useAppStore((s) => s.collapsedPaths);
  const toggleCollapse = useAppStore((s) => s.toggleNodeCollapse);
  const isCollapsed = collapsedPaths.includes(data.path);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleCollapse(data.path);
  };

  const handleToggleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <div
      className={`mindmap-node ${selected ? "is-selected" : ""} ${data.isDir ? "is-dir" : "is-file"}`}
      style={{ width: 220 }}
      title={data.path}
    >
      <Handle type="target" position={Position.Left} className="!bg-border" />

      {/* 折叠/展开按钮（仅目录节点） */}
      {data.isDir ? (
        <button
          type="button"
          className="mindmap-node-toggle"
          onClick={handleToggle}
          onDoubleClick={handleToggleDoubleClick}
          title={isCollapsed ? "展开子节点" : "收起子节点"}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`mindmap-node-chevron ${isCollapsed ? "" : "is-open"}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      ) : (
        <span className="mindmap-node-toggle-spacer" />
      )}

      <span className="mindmap-node-icon">
        {isCollapsed ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        ) : data.isDir ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <path d="M12 10v8M9 14h6" strokeWidth="1.5" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )}
      </span>
      <span className="mindmap-node-label min-w-0">{data.label}</span>
      {data.childCount > 0 && !isCollapsed && (
        <span className="mindmap-node-badge">{data.childCount}</span>
      )}
      <Handle type="source" position={Position.Right} className="!bg-border" />
    </div>
  );
}

// ============================================================
// HiddenMarkerNode — 被隐藏文件指示节点
// ============================================================
export function HiddenMarkerNode({ data }: NodeProps<MindMapNodeData>) {
  return (
    <div className="mindmap-node mindmap-node-hidden" style={{ width: 220 }} title={data.path}>
      <Handle type="target" position={Position.Left} className="!bg-border" />
      <span
        className="mindmap-node-icon"
        style={{ color: "hsl(var(--muted-foreground))" }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="m14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" x2="23" y1="1" y2="23" />
        </svg>
      </span>
      <span className="mindmap-node-label min-w-0">{data.label}</span>
      <Handle type="source" position={Position.Right} className="!bg-border" />
    </div>
  );
}
