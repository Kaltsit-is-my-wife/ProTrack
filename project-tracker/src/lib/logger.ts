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
 * 前端日志模块
 *
 * - 拦截 console.log / warn / error
 * - 捕获未处理的 Promise rejection 和 Error
 * - 通过 invoke("log_message") 写入 Rust 日志文件
 * - 日志文件位于项目根目录的 log/ 下，按日期命名
 */

import { invoke } from "@tauri-apps/api/core";

// ============================================================
// 初始化标志 + 日志队列（防止并发 IPC 导致日志丢失）
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

function sendLog(
  level: "debug" | "info" | "warn" | "error",
  source: string,
  message: string,
) {
  queue.push({ level, source, message });
  drainQueue();
}

/** 将任意参数格式化为字符串 */
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
// 拦截 console
// ============================================================

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: (console.debug ?? console.log).bind(console),
};

function interceptConsole() {
  console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    sendLog("info", "console", formatArgs(args));
  };

  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    sendLog("warn", "console", formatArgs(args));
  };

  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    sendLog("error", "console", formatArgs(args));
  };
}

// ============================================================
// 捕获全局错误
// ============================================================

function captureGlobalErrors() {
  // 未处理的 Promise rejection
  window.addEventListener("unhandledrejection", (event) => {
    const reason =
      event.reason instanceof Error
        ? `${event.reason.name}: ${event.reason.message}\n${event.reason.stack ?? ""}`
        : String(event.reason);
    originalConsole.error("[UnhandledRejection]", reason);
    sendLog("error", "global", `UnhandledRejection: ${reason}`);
  });

  // 未捕获的异常
  window.addEventListener("error", (event) => {
    // 过滤 React/浏览器内部的无害警告
    const msg = event.message;
    if (
      msg.includes("ResizeObserver loop") ||
      msg.includes("ResizeObserverLoop")
    ) {
      return; // 无害，静默忽略
    }
    const fullMsg = `${msg} at ${event.filename}:${event.lineno}:${event.colno}`;
    originalConsole.error("[UncaughtError]", fullMsg);
    sendLog("error", "global", `UncaughtError: ${fullMsg}`);
  });
}

// ============================================================
// 公开 API
// ============================================================

/** 初始化日志系统（在 main.tsx 中最先调用） */
export function initLogger() {
  if (initialized) return;
  initialized = true;

  interceptConsole();
  captureGlobalErrors();

  // 写启动标记
  const ua = navigator.userAgent;
  const time = new Date().toISOString();
  originalConsole.log(`[Logger] 日志系统已初始化 (${time})`);
  sendLog("info", "system", `前端日志初始化 | UA: ${ua} | Time: ${time}`);
}

/** 显式写入一条日志（用于关键操作点） */
export async function log(
  level: "debug" | "info" | "warn" | "error",
  source: string,
  message: string,
) {
  await sendLog(level, source, message);
}

/** 恢复原生 console（仅在需要时使用） */
export function restoreConsole() {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}
