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

import { safeInvoke } from "@/lib/invoke";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DirNode } from "@/types/directory";
import type { Project } from "@/types/project";
import type { ChatMessage } from "@/store/useAppStore";
import { useAppStore } from "@/store/useAppStore";

// ============================================================
// 请求 / 响应类型（与 Rust ai.rs 对齐）
// ============================================================

export interface AnalyzeRequest {
  projectId: string;
  projectName: string;
  projectPath: string;
  status: string;
  nextSteps: string;
  notes: string;
  /** 目录树 JSON 字符串 */
  treeJson: string;
  /** 用户数据目录 */
  dataDir: string;
  /** API Key（空=使用 .env） */
  apiKey?: string;
  /** API 端点（空=使用 .env） */
  apiEndpoint?: string;
  /** 模型（空=使用 .env） */
  model?: string;
}

export interface AnalyzeCoreResponse {
  summary: string;
  suggestedNextSteps: string[];
  structureInsights: string[];
  risks: string[];
}

export interface AnalyzeFileOrgResponse {
  fileOrganization: string;
}

export interface AnalyzeResponse {
  summary: string;
  suggestedNextSteps: string[];
  structureInsights: string[];
  risks: string[];
  /** 文件整理方案 — 树形 ASCII 文本 */
  fileOrganization?: string;
}

// ============================================================
// analyzeProjectCore — 核心分析（概述 + 建议 + 洞察 + 风险）
// ============================================================

/** 读取用户设置的 AI 配置（Key / 端点 / 模型），空值由 Rust 端降级到 .env */
function getAiOverrides(): { apiKey: string; apiEndpoint: string; model: string } {
  const s = useAppStore.getState().settings;
  return {
    apiKey: s.apiKey ?? "",
    apiEndpoint: s.apiEndpoint ?? "",
    model: s.model ?? "",
  };
}

// ============================================================
// analyzeProjectCore — 核心分析（概述 + 建议 + 洞察 + 风险）
// ============================================================

export async function analyzeProjectCore(
  project: Project,
  tree: DirNode,
  dataDir: string,
): Promise<AnalyzeCoreResponse> {
  const treeJson = JSON.stringify(tree);
  const req: AnalyzeRequest = {
    projectId: project.id,
    projectName: project.name,
    projectPath: project.path,
    status: project.status,
    nextSteps: project.nextSteps,
    notes: project.notes,
    treeJson,
    dataDir,
    ...getAiOverrides(),
  };
  return safeInvoke<AnalyzeCoreResponse>("analyze_project_core", { req }, { showError: false }) as Promise<AnalyzeCoreResponse>;
}

// ============================================================
// analyzeProjectFileOrg — 文件整理方案（树形文本）
// ============================================================

export async function analyzeProjectFileOrg(
  project: Project,
  tree: DirNode,
  dataDir: string,
): Promise<AnalyzeFileOrgResponse> {
  const treeJson = JSON.stringify(tree);
  const req: AnalyzeRequest = {
    projectId: project.id,
    projectName: project.name,
    projectPath: project.path,
    status: project.status,
    nextSteps: project.nextSteps,
    notes: project.notes,
    treeJson,
    dataDir,
    ...getAiOverrides(),
  };
  return safeInvoke<AnalyzeFileOrgResponse>("analyze_project_file_org", { req }, { showError: false }) as Promise<AnalyzeFileOrgResponse>;
}

// ============================================================
// analyzeProject — 并行调用两个分析（便捷封装）
// ============================================================

export async function analyzeProject(
  project: Project,
  tree: DirNode,
  dataDir: string,
): Promise<AnalyzeResponse> {
  const treeJson = JSON.stringify(tree);
  console.log(
    "[AI:Frontend] 发起并行分析 | projectId:",
    project.id,
    "| name:",
    project.name,
  );

  const req: AnalyzeRequest = {
    projectId: project.id,
    projectName: project.name,
    projectPath: project.path,
    status: project.status,
    nextSteps: project.nextSteps,
    notes: project.notes,
    treeJson,
    dataDir,
  };

  const t0 = performance.now();

  const [coreResult, fileOrgResult] = await Promise.all([
    safeInvoke<AnalyzeCoreResponse>("analyze_project_core", { req }, { showError: false }),
    safeInvoke<AnalyzeFileOrgResponse>("analyze_project_file_org", { req }, { showError: false }),
  ]);

  if (!coreResult || !fileOrgResult) {
    throw new Error("AI 分析失败");
  }

  const elapsed = (performance.now() - t0).toFixed(0);
  console.log(
    "[AI:Frontend] 并行分析完成 | coreLen:",
    coreResult.summary.length,
    "| fileOrgLen:",
    fileOrgResult.fileOrganization.length,
    "| roundtrip:",
    elapsed,
    "ms",
  );

  return {
    summary: coreResult.summary,
    suggestedNextSteps: coreResult.suggestedNextSteps,
    structureInsights: coreResult.structureInsights,
    risks: coreResult.risks,
    fileOrganization: fileOrgResult.fileOrganization,
  };
}

// ============================================================
// chat_with_ai — AI 对话
// ============================================================

export interface ChatRequest {
  projectId: string;
  projectName: string;
  projectPath: string;
  status: string;
  nextSteps: string;
  notes: string;
  /** 已过滤隐藏节点的目录树 JSON */
  treeJson: string;
  userMessage: string;
  /** 最近 N 轮对话历史 */
  history: { role: string; text: string }[];
  /** 用户数据目录（空 = 使用系统默认），用于解析 Layer 2 prompt */
  dataDir: string;
  /** API Key（空=使用 .env） */
  apiKey?: string;
  /** API 端点（空=使用 .env） */
  apiEndpoint?: string;
  /** 模型（空=使用 .env） */
  model?: string;
}

export interface ChatResponse {
  text: string;
  /** 使用的 prompt 层级：1=兜底, 2=全局系统, 3=项目级 */
  promptLayer: number;
}

/**
 * 递归过滤目录树中的隐藏文件/目录
 * @param node 目录节点
 * @param hiddenFiles 隐藏文件映射（父目录路径 → 文件名列表）
 * @returns 过滤后的新节点，或 null 表示该节点应被移除
 */
function filterTreeNode(
  node: DirNode,
  hiddenFiles: Record<string, string[]>,
): DirNode | null {
  const hiddenInThisDir = hiddenFiles[node.path] ?? [];

  if (!node.isDir) {
    // 文件节点：检查是否被隐藏
    return hiddenInThisDir.includes(node.name) ? null : node;
  }

  // 目录节点：递归过滤子节点
  const filteredChildren = (node.children ?? [])
    .map((child) => filterTreeNode(child, hiddenFiles))
    .filter((c): c is DirNode => c !== null);

  // 如果目录本身被隐藏，移除整个目录
  if (hiddenInThisDir.includes(node.name)) return null;

  return { ...node, children: filteredChildren };
}

/** 流式聊天：发送消息，通过回调接收实时 chunk */
export async function chatWithAiStream(
  project: Project,
  tree: DirNode,
  userMessage: string,
  history: ChatMessage[],
  hiddenFiles: Record<string, string[]>,
  dataDir: string,
  onChunk: (text: string) => void,
  onDone: (promptLayer: number) => void,
  onError: (error: string) => void,
): Promise<void> {
  // 过滤隐藏节点
  const filteredTree = filterTreeNode(tree, hiddenFiles) ?? tree;
  const treeJson = JSON.stringify(filteredTree);

  const req: ChatRequest = {
    projectId: project.id,
    projectName: project.name,
    projectPath: project.path,
    status: project.status,
    nextSteps: project.nextSteps,
    notes: project.notes,
    treeJson,
    userMessage,
    history: history.map((msg) => ({ role: msg.role, text: msg.text })),
    dataDir,
    ...getAiOverrides(),
  };

  console.log(
    "[AI:Chat] 发起流式对话 | projectId:",
    project.id,
    "| msgLen:",
    userMessage.length,
    "| historyRounds:",
    history.length,
  );

  // 注册事件监听
  const unlisteners: UnlistenFn[] = [];

  const unlistenChunk = await listen<{ projectId: string; text: string }>(
    "chat-stream-chunk",
    (event) => {
      if (event.payload.projectId === project.id) {
        onChunk(event.payload.text);
      }
    },
  );
  unlisteners.push(unlistenChunk);

  const unlistenDone = await listen<{ projectId: string; promptLayer: number }>(
    "chat-stream-done",
    (event) => {
      if (event.payload.projectId === project.id) {
        onDone(event.payload.promptLayer);
        for (const fn of unlisteners) fn();
      }
    },
  );
  unlisteners.push(unlistenDone);

  const unlistenError = await listen<{ projectId: string; error: string }>(
    "chat-stream-error",
    (event) => {
      if (event.payload.projectId === project.id) {
        onError(event.payload.error);
        for (const fn of unlisteners) fn();
      }
    },
  );
  unlisteners.push(unlistenError);

  // 发起流式请求（命令立即返回），错误由事件流 chat-stream-error 传递
  const t0 = performance.now();
  await safeInvoke("chat_with_ai", { req }, { silent: true });
  const elapsed = (performance.now() - t0).toFixed(0);
  console.log("[AI:Chat] 流式请求已发起 | elapsed:", elapsed + "ms");
}
