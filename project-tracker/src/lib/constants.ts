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

/**
 * 前端常量集中管理（遵循 docs/13-constant-principle.md）
 *
 * - 应用生命周期内固定不变的值
 * - SCREAMING_SNAKE_CASE 命名
 * - 逻辑分组 + 注释说明
 */

// ============================================================
// 思维导图布局（ELK.js）
// ============================================================

/** 节点固定宽度 (px)，与 ELK 布局计算一致 */
export const MINDMAP_NODE_WIDTH = 220;

/** 节点固定高度 (px) */
export const MINDMAP_NODE_HEIGHT = 32;

/** 同级节点最小垂直间距 (px) */
export const MINDMAP_MIN_NODE_GAP = MINDMAP_NODE_HEIGHT + 30;

/** 导图深度选项 */
export const DEPTH_OPTIONS = Object.freeze([
  { value: "0", label: "仅根目录" },
  { value: "1", label: "深度 1" },
  { value: "2", label: "深度 2" },
  { value: "3", label: "深度 3" },
  { value: "4", label: "深度 4" },
  { value: "5", label: "深度 5" },
]);

// ============================================================
// 数据持久化
// ============================================================

/** 自动保存防抖延迟 (ms) */
export const PERSIST_DEBOUNCE_MS = 500;

/** tauri-plugin-store 配置文件路径 */
export const PERSIST_STORE_PATH = "app-state.json";

/** 业务数据文件名 */
export const PERSIST_BUSINESS_FILE = "projects.json";

/** 快照缓存 key */
export const PERSIST_SNAPSHOTS_CACHE_KEY = "snapshots";

// ============================================================
// 聊天面板
// ============================================================

/** 传给 AI 的历史消息轮数上限 */
export const CHAT_MAX_HISTORY_ROUNDS = 20;

/** 文本输入框最大高度 (px) */
export const CHAT_TEXTAREA_MAX_HEIGHT = 120;

// ============================================================
// 目录扫描
// ============================================================

/** 添加项目时的默认扫描深度 */
export const SCAN_DEFAULT_DEPTH = 5;

// ============================================================
// 设置
// ============================================================

/** 默认导图深度（新用户） */
export const SETTINGS_DEFAULT_DEPTH = 3;

/** 默认节点间距 (px) */
export const SETTINGS_DEFAULT_NODE_SPACING = 80;

/** 面板默认宽度 (px) */
export const PANEL_LEFT_DEFAULT_WIDTH = 280;
export const PANEL_RIGHT_DEFAULT_WIDTH = 320;

// ============================================================
// Toast 通知
// ============================================================

/** 错误提示持续时间 (ms) */
export const TOAST_ERROR_DURATION_MS = 5000;

/** 成功提示持续时间 (ms) */
export const TOAST_SUCCESS_DURATION_MS = 3000;

// ============================================================
// Tauri IPC
// ============================================================

/** 日志消息发送到后端的 IPC 命令 */
export const IPC_LOG_MESSAGE = "log_message";

/** 确保 .project-tracker 目录的 IPC 命令 */
export const IPC_ENSURE_PROJECT_TRACKER = "ensure_project_tracker_dir";
