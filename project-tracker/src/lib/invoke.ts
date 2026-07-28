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

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

// ============================================================
// 类型（与 Rust AppError 对齐）
// ============================================================

/** Rust 端返回的结构化错误 */
export interface AppError {
  code: string;
  message: string;
  detail?: string;
}

export interface InvokeOptions {
  /** 是否在错误时弹出 Toast 通知（默认 true） */
  showError?: boolean;
  /** 是否在成功时弹出 Toast 通知（默认 false） */
  showSuccess?: boolean;
  /** 成功时的提示文本 */
  successMessage?: string;
  /** 是否静默处理（只打 console，不弹 Toast） */
  silent?: boolean;
}

// ============================================================
// 解析错误
// ============================================================

function parseError(err: unknown): AppError {
  // Tauri v2 命令错误体的可能形式：
  //   - 裸 JSON 字符串      (serde 序列化后 IPC 直接传)
  //   - Error 对象          (@tauri-apps/api 内部 throw new Error(json))
  //   - 已解析的 JSON 对象   (IPC 层直接抛反序列化后的值)
  // 统一处理所有情况。

  // 1) 已经是 AppError 形状的对象 → 直接返回
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.code === "string" && typeof obj.message === "string") {
      return {
        code: obj.code,
        message: obj.message,
        detail: typeof obj.detail === "string" ? obj.detail : undefined,
      };
    }
  }

  // 2) 提取纯文本
  const raw: string =
    typeof err === "string" ? err
    : err instanceof Error ? err.message
    : String(err);

  // 3) 尝试 JSON 解析（覆盖 Tauri v2 serde 序列化 + Error.message 包裹）
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.code === "string" && typeof parsed.message === "string") {
      return parsed as AppError;
    }
  } catch {
    // 不是合法 JSON
  }

  // 4) Display 格式："[CODE] message"
  const displayMatch = raw.match(/^\[([A-Z_]+)\]\s+(.+)$/);
  if (displayMatch) {
    return { code: displayMatch[1], message: displayMatch[2] };
  }

  console.warn("[invoke:parseError] 未识别的错误格式:", JSON.stringify(raw));
  return { code: "UNKNOWN", message: raw };
}

// ============================================================
// 显示错误 Toast
// ============================================================

function showErrorToast(err: AppError) {
  const detail = err.detail ? `\n${err.detail}` : "";
  console.error(`[invoke] ${err.code}: ${err.message}${detail}`);

  toast.error(err.message, {
    description: err.code,
    duration: 5000,
  });
}

// ============================================================
// safeInvoke — 安全的 Tauri IPC 调用
// ============================================================

/**
 * 调用 Tauri 命令，自动处理错误并弹出 Toast 通知。
 *
 * @param cmd   Tauri 命令名
 * @param args  命令参数（可选）
 * @param opts  选项（可选）
 * @returns     成功时返回反序列化的结果，失败时返回 null
 *
 * @example
 *   const result = await safeInvoke("save_data_file", { filename, dataDir, json });
 *   if (result === null) return; // 已自动弹出错误 Toast
 *
 * @example
 *   // 静默模式（后台操作，失败不提示用户）
 *   await safeInvoke("ensure_project_tracker_dir", { projectPath }, { silent: true });
 */
export async function safeInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
  opts: InvokeOptions = {},
): Promise<T | null> {
  const { showError = true, showSuccess = false, successMessage, silent = false } = opts;

  try {
    const result = await tauriInvoke<T>(cmd, args);

    if (showSuccess && successMessage) {
      toast.success(successMessage, { duration: 3000 });
    }

    return result;
  } catch (err) {
    const appErr = parseError(err);

    if (silent) {
      console.warn(`[invoke:silent] ${cmd} | ${appErr.code}: ${appErr.message}`);
    } else if (showError) {
      showErrorToast(appErr);
    } else {
      console.error(`[invoke] ${cmd} | ${appErr.code}: ${appErr.message}`);
    }

    return null;
  }
}
