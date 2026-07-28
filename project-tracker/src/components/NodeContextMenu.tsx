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

import { useCallback, useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  EyeOff,
  FileX,
  RefreshCw,
} from "lucide-react";

// ============================================================
// 菜单项定义（留后手：扩展新功能只需加条目）
// ============================================================

export interface ContextMenuAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** 分组分隔线（在该项之前显示） */
  separatorBefore?: boolean;
  /** 禁用状态 */
  disabled?: boolean;
  action: () => void;
}

// ============================================================
// Props
// ============================================================

interface NodeContextMenuProps {
  x: number;
  y: number;
  isCollapsed: boolean;
  isDir: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
  onRefreshSubtree: () => void;
  onExcludeDir: () => void;
  onHideFile: () => void;
}

// ============================================================
// NodeContextMenu
// ============================================================

export function NodeContextMenu({
  x,
  y,
  isCollapsed,
  isDir,
  onClose,
  onToggleCollapse,
  onRefreshSubtree,
  onExcludeDir,
  onHideFile,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 多种方式关闭菜单（点击外部 / 右键 / 滚轮 / 缩放窗口 / Esc）
  useEffect(() => {
    // 忽略打开菜单时的那次事件（避免刚打开就被关闭）
    let settled = false;
    const settleTimer = setTimeout(() => {
      settled = true;
    }, 100);

    const handlePointerDown = (e: PointerEvent) => {
      if (!settled) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleWheel = () => {
      if (settled) onClose();
    };
    const handleResize = () => onClose();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    // capture: true 确保在 React Flow 之前捕获事件
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("wheel", handleWheel, true);
    window.addEventListener("resize", handleResize);
    document.addEventListener("keydown", handleKey, true);

    return () => {
      clearTimeout(settleTimer);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("wheel", handleWheel, true);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [onClose]);

  // 防止菜单溢出屏幕
  const adjustedX = Math.min(x, window.innerWidth - 180);
  const adjustedY = Math.min(y, window.innerHeight - 120);

  // ---- 菜单项构建 ----
  const items: ContextMenuAction[] = [
    {
      key: "collapse",
      label: isCollapsed ? "展开子节点" : "折叠子节点",
      icon: isCollapsed ? (
        <ChevronRight className="size-3.5" />
      ) : (
        <ChevronDown className="size-3.5" />
      ),
      disabled: !isDir,
      action: onToggleCollapse,
    },
    {
      key: "relayout",
      label: "重排子节点",
      icon: <RefreshCw className="size-3.5" />,
      disabled: !isDir,
      action: onRefreshSubtree,
    },
    {
      key: "exclude",
      label: "排除此目录",
      icon: <EyeOff className="size-3.5" />,
      disabled: !isDir,
      separatorBefore: true,
      action: onExcludeDir,
    },
    {
      key: "hide",
      label: "隐藏此文件",
      icon: <FileX className="size-3.5" />,
      disabled: isDir,
      action: onHideFile,
    },
  ];

  const handleItemClick = useCallback(
    (item: ContextMenuAction) => {
      if (item.disabled) return;
      item.action();
      onClose();
    },
    [onClose],
  );

  return (
    <div
      ref={menuRef}
      className="node-context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, i) => (
        <div key={item.key}>
          {item.separatorBefore && i > 0 && (
            <div className="node-context-menu-separator" />
          )}
          <button
            type="button"
            className={`node-context-menu-item ${item.disabled ? "is-disabled" : ""}`}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
          >
            <span className="node-context-menu-icon">{item.icon}</span>
            <span className="node-context-menu-label">{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
