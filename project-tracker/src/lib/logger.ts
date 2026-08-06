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
 * 前端日志模块（遵循 docs/12-log-principles.md）
 *
 * - 显式 API：logger.info / warn / error / debug
 * - 拦截 console.log / warn / error 转发到 Rust 日志文件
 * - 捕获未处理的 Promise rejection 和 Error
 * - dev 模式：DEBUG/INFO/WARN/ERROR 全部输出到 console + IPC
 * - release 模式：仅 ERROR 通过 IPC 写入后端日志文件
 */

import { invoke } from "@tauri-apps/api/core";

// ============================================================
// 环境检测
// ============================================================

const isDev = typeof window !== "undefined" && !(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  ? false
  : true; // Tauri 环境默认按 dev 处理，build 时 Vite 的 define 可覆盖

// ============================================================
// 初始化标志 + 日志队列
// ============================================================

let initialized = false;
let draining = false;

interface QueuedEntry {
  level: "debug" | "info" | "warn" | "error";
  source: string;
  message: string;
}

const queue: QueuedEntry[] = [];

// ============================================================
// 核心方法
// ============================================================

async function drainQueue() {
  if (draining) return;
  draining = true;
  while (queue.length > 0) {
    const entry = queue.shift()!;
    try {
      await invoke("log_message", {
        entry: {
          level: entry.level,
          source: entry.source,
          message: entry.message,
        },
      });
    } catch {
      // Rust 后端不可用时静默失败
    }
  }
  draining = false;
}

function enqueue(
  level: "debug" | "info" | "warn" | "error",
  source: string,
  message: string,
) {
  // release 模式：仅 ERROR 写入后端文件，其余级别丢弃
  if (!isDev && level !== "error") return;
  queue.push({ level, source, message });
  drainQueue();
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ""}`;
      if (typeof a === "object") {
        try {
          return JSON.stringify(a, null, 2);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(" ");
}

// ============================================================
// 显式 API（推荐使用，禁止在组件渲染中调用 debug/info）
// ============================================================

export const logger = {
  debug(source: string, ...args: unknown[]) {
    if (!isDev) return;
    const msg = formatArgs(args);
    originalConsole.debug(`[${source}]`, msg);
  },

  info(source: string, ...args: unknown[]) {
    const msg = formatArgs(args);
    originalConsole.log(`[${source}]`, msg);
    enqueue("info", source, msg);
  },

  warn(source: string, ...args: unknown[]) {
    const msg = formatArgs(args);
    originalConsole.warn(`[${source}]`, msg);
    enqueue("warn", source, msg);
  },

  error(source: string, ...args: unknown[]) {
    const msg = formatArgs(args);
    originalConsole.error(`[${source}]`, msg);
    enqueue("error", source, msg);
  },
};

// ============================================================
// 原始 console 引用
// ============================================================

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: (console.debug ?? console.log).bind(console),
};

// ============================================================
// 拦截 console（兜底：捕获未迁移的裸 console.log）
// ============================================================

function interceptConsole() {
  console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    enqueue("info", "console", formatArgs(args));
  };

  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    enqueue("warn", "console", formatArgs(args));
  };

  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    enqueue("error", "console", formatArgs(args));
  };
}

// ============================================================
// 捕获全局错误
// ============================================================

function captureGlobalErrors() {
  window.addEventListener("unhandledrejection", (event) => {
    const reason =
      event.reason instanceof Error
        ? `${event.reason.name}: ${event.reason.message}\n${event.reason.stack ?? ""}`
        : String(event.reason);
    logger.error("global", `UnhandledRejection: ${reason}`);
  });

  window.addEventListener("error", (event) => {
    const msg = event.message;
    if (
      msg.includes("ResizeObserver loop") ||
      msg.includes("ResizeObserverLoop")
    ) {
      return;
    }
    logger.error("global", `${msg} at ${event.filename}:${event.lineno}:${event.colno}`);
  });
}

// ============================================================
// 公开 API
// ============================================================

export function initLogger() {
  if (initialized) return;
  initialized = true;

  interceptConsole();
  captureGlobalErrors();

  const time = new Date().toISOString();
  logger.info("system", `前端日志初始化 | Time: ${time}`);
}

export function restoreConsole() {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}
