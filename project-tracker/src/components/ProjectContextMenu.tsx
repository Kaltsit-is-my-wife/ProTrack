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
import { Filter, Trash2 } from "lucide-react";

// ============================================================
// 菜单项定义（留后手：后续新增选项只需往 items 数组追加）
// ============================================================

interface ProjectMenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** 在该项之前显示分组分隔线 */
  separatorBefore?: boolean;
  /** 危险操作（红色高亮） */
  danger?: boolean;
  action: () => void;
}

// ============================================================
// Props
// ============================================================

interface ProjectContextMenuProps {
  x: number;
  y: number;
  projectName: string;
  onClose: () => void;
  onRemove: () => void;
  onEditIgnore: () => void;
}

// ============================================================
// ProjectContextMenu
// ============================================================

export function ProjectContextMenu({
  x,
  y,
  projectName,
  onClose,
  onRemove,
  onEditIgnore,
}: ProjectContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 多种方式关闭菜单（点击外部 / 右键 / 滚轮 / 缩放 / Esc）
  useEffect(() => {
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
    const handleContextMenu = () => {
      if (settled) onClose();
    };
    const handleWheel = () => {
      if (settled) onClose();
    };
    const handleResize = () => onClose();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("contextmenu", handleContextMenu, true);
    document.addEventListener("wheel", handleWheel, true);
    window.addEventListener("resize", handleResize);
    document.addEventListener("keydown", handleKey, true);

    return () => {
      clearTimeout(settleTimer);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      document.removeEventListener("wheel", handleWheel, true);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [onClose]);

  // 防止菜单溢出屏幕
  const adjustedX = Math.min(x, window.innerWidth - 180);
  const adjustedY = Math.min(y, window.innerHeight - 80);

  // ---- 菜单项构建（后续新增选项只需往这里追加）----
  const items: ProjectMenuItem[] = [
    {
      key: "ignore",
      label: "编辑排除规则",
      icon: <Filter className="size-3.5" />,
      action: onEditIgnore,
    },
    {
      key: "remove",
      label: "移除",
      icon: <Trash2 className="size-3.5" />,
      danger: true,
      separatorBefore: true,
      action: onRemove,
    },
  ];

  const handleItemClick = useCallback(
    (item: ProjectMenuItem) => {
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
      <div className="node-context-menu-item is-disabled !opacity-100 !cursor-default">
        <span className="node-context-menu-label !text-[10px] !text-muted-foreground truncate max-w-[160px]">
          {projectName}
        </span>
      </div>
      <div className="node-context-menu-separator" />
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`node-context-menu-item ${item.danger ? "!text-destructive" : ""}`}
          onClick={() => handleItemClick(item)}
        >
          <span
            className={`node-context-menu-icon ${item.danger ? "!text-destructive" : ""}`}
          >
            {item.icon}
          </span>
          <span className="node-context-menu-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
