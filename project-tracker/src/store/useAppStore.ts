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

import { create } from "zustand";
import { useShallow } from "zustand/shallow";
import type { Project, CreateProjectInput } from "@/types/project";
import type { DirNode } from "@/types/directory";
import type { Node, Edge } from "reactflow";
import type { MindMapNodeData } from "@/lib/layoutMindMap";
import type { AnalyzeResponse } from "@/lib/ai";

// ============================================================
// 项目快照（完整保存思维导图视图状态，用于切项目恢复 + AI 分析）
// ============================================================

export interface ProjectSnapshot {
  /** 快照创建时间 */
  savedAt: number;
  /** 目录树根路径（用于检测目录是否变更） */
  treeRootPath: string;
  /** React Flow 节点（含位置、类型、数据） */
  nodes: Node<MindMapNodeData>[];
  /** React Flow 边 */
  edges: Edge[];
  /** 折叠的节点路径 */
  collapsedPaths: string[];
  /** 用户手动隐藏的文件 */
  hiddenFiles: Record<string, string[]>;
  /** 导图深度 */
  maxDepth: number;
  /** 目录指纹 JSON（用于检测磁盘变更） */
  dirFingerprint?: string;
}

// ============================================================
// AI 分析结果
// ============================================================

export interface AiAnalysis {
  /** 分析时间 */
  analyzedAt: number;
  /** AI 返回的完整结果 */
  response: AnalyzeResponse;
}

// ============================================================
// 聊天消息
// ============================================================

export interface ChatMessage {
  id: string;
  text: string;
  role: "user" | "ai";
  time: number;
}

// ============================================================
// AppState — 全局状态
// ============================================================

export interface AppState {
  // ---- 项目 ----
  projects: Project[];
  activeProjectId: string | null;

  // ---- 目录树（按项目 ID 索引） ----
  projectTrees: Record<string, DirNode>;

  // ---- 思维导图 ----
  /** 每个项目独立的导图深度（不存在时回退到 settings.defaultDepth） */
  maxDepthByProject: Record<string, number>;
  /** 被折叠的节点路径集合 */
  collapsedPaths: string[];
  /** 被过滤隐藏的文件（父目录路径 → 文件名列表） */
  hiddenFiles: Record<string, string[]>;
  /** 项目视图快照（按项目 ID 索引） */
  projectSnapshots: Record<string, ProjectSnapshot>;
  /** 检测到目录变更的项目 ID 集合 */
  staleProjects: Record<string, true>;

  // ---- AI 分析 ----
  /** AI 分析历史（按项目 ID 索引，每个项目一个数组，新→旧排序） */
  aiAnalyses: Record<string, AiAnalysis[]>;
  /** 正在分析中的项目 ID 集合 */
  aiLoading: Record<string, true>;

  // ---- 聊天 ----
  /** AI 对话历史（按项目 ID 索引） */
  chatMessages: Record<string, ChatMessage[]>;

  // ---- 设置 ----
  settings: {
    theme: "light" | "dark" | "system";
    apiKey: string;
    /** AI API 端点（空=使用 .env） */
    apiEndpoint: string;
    /** AI 模型名称（空=使用 .env） */
    model: string;
    defaultDepth: number;
    /** 自定义数据存储路径（空=使用系统默认） */
    dataPath: string;
    /** 下一步工作预设词条 */
    nextStepPresets: string[];
    /** 同级节点间距 (30–150) */
    nodeSpacing: number;
    /** AI 历史记录呈现方式 */
    aiHistoryMode: "timeline" | "dropdown";
    /** 永久取消 Layer 1 兜底 prompt 提醒 */
    suppressLayer1Warning: boolean;
  };

  // ---- actions ----
  addProject: (input: CreateProjectInput) => void;
  removeProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  updateProject: (id: string, data: Partial<Project>) => void;
  setProjectTree: (id: string, tree: DirNode) => void;
  setMaxDepth: (projectId: string, depth: number) => void;
  toggleNodeCollapse: (path: string) => void;
  clearCollapsed: () => void;
  setHiddenFiles: (map: Record<string, string[]>) => void;
  saveProjectSnapshot: (projectId: string, snapshot: ProjectSnapshot) => void;
  clearProjectSnapshot: (projectId: string) => void;
  markProjectStale: (projectId: string) => void;
  clearProjectStale: (projectId: string) => void;
  setAiAnalysis: (projectId: string, analysis: AiAnalysis) => void;
  clearAiAnalysis: (projectId: string) => void;
  setAiLoading: (projectId: string, loading: boolean) => void;
  addChatMessage: (projectId: string, message: ChatMessage) => void;
  updateSettings: (patch: Partial<AppState["settings"]>) => void;
}

// ============================================================
// 生成简易 ID
// ============================================================

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ============================================================
// Store 定义 (Zustand v5 双括号语法)
// ============================================================

export const useAppStore = create<AppState>()((set) => ({
  // ---- 初始状态 ----
  projects: [],
  activeProjectId: null,
  projectTrees: {},
  maxDepthByProject: {},
  collapsedPaths: [],
  hiddenFiles: {},
  projectSnapshots: {},
  staleProjects: {},
  aiAnalyses: {},
  aiLoading: {},
  chatMessages: {},

  settings: {
    theme: "system",
    apiKey: "",
    apiEndpoint: "",
    model: "",
    defaultDepth: 3,
    dataPath: "",
    nextStepPresets: [
      "添加单元测试",
      "编写 API 接口",
      "对接前端页面",
      "代码审查",
      "更新文档",
      "修复已知 Bug",
      "性能优化",
      "部署上线",
      "数据库迁移",
      "重构代码结构",
    ],
    nodeSpacing: 70,
    aiHistoryMode: "timeline" as const,
    suppressLayer1Warning: false,
  },

  // ---- actions ----

  addProject: (input) =>
    set((state) => {
      const now = Date.now();
      const project: Project = {
        ...input,
        id: uid(),
        createdAt: now,
        updatedAt: now,
      };
      return { projects: [...state.projects, project] };
    }),

  removeProject: (id) =>
    set((state) => {
      console.log("[Store] 删除项目 | id:", id, "| wasActive:", state.activeProjectId === id);
      const { [id]: _, ...remainingTrees } = state.projectTrees;
      const { [id]: __, ...remainingSnapshots } = state.projectSnapshots;
      const { [id]: ___, ...remainingDepths } = state.maxDepthByProject;
      const { [id]: ____, ...remainingStale } = state.staleProjects;
      const { [id]: _____, ...remainingAi } = state.aiAnalyses;
      const { [id]: ______, ...remainingLoading } = state.aiLoading;
      const { [id]: _______, ...remainingChat } = state.chatMessages;
      return {
        projects: state.projects.filter((p) => p.id !== id),
        projectTrees: remainingTrees,
        projectSnapshots: remainingSnapshots,
        maxDepthByProject: remainingDepths,
        staleProjects: remainingStale,
        aiAnalyses: remainingAi,
        aiLoading: remainingLoading,
        chatMessages: remainingChat,
        activeProjectId:
          state.activeProjectId === id ? null : state.activeProjectId,
      };
    }),

  setActiveProject: (id) => set({ activeProjectId: id }),

  updateProject: (id, data) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...data, updatedAt: Date.now() } : p
      ),
    })),

  setProjectTree: (id, tree) =>
    set((state) => ({
      projectTrees: { ...state.projectTrees, [id]: tree },
    })),

  setMaxDepth: (projectId, depth) =>
    set((state) => {
      console.log("[Store] setMaxDepth | projectId:", projectId, "| depth:", depth);
      return {
        maxDepthByProject: { ...state.maxDepthByProject, [projectId]: depth },
      };
    }),

  toggleNodeCollapse: (path) =>
    set((state) => {
      const exists = state.collapsedPaths.includes(path);
      console.log("[Store] toggleCollapse | path:", path, "| action:", exists ? "expand" : "collapse", "| total:", exists ? state.collapsedPaths.length - 1 : state.collapsedPaths.length + 1);
      return {
        collapsedPaths: exists
          ? state.collapsedPaths.filter((p) => p !== path)
          : [...state.collapsedPaths, path],
      };
    }),

  clearCollapsed: () => {
    console.log("[Store] clearCollapsed");
    set({ collapsedPaths: [] });
  },

  setHiddenFiles: (map) => set({ hiddenFiles: map }),

  saveProjectSnapshot: (projectId, snapshot) =>
    set((state) => ({
      projectSnapshots: {
        ...state.projectSnapshots,
        [projectId]: snapshot,
      },
    })),

  clearProjectSnapshot: (projectId) =>
    set((state) => {
      const { [projectId]: _, ...rest } = state.projectSnapshots;
      return { projectSnapshots: rest };
    }),

  markProjectStale: (projectId) =>
    set((state) => ({
      staleProjects: { ...state.staleProjects, [projectId]: true as const },
    })),

  clearProjectStale: (projectId) =>
    set((state) => {
      const { [projectId]: _, ...rest } = state.staleProjects;
      return { staleProjects: rest };
    }),

  setAiAnalysis: (projectId, analysis) =>
    set((state) => {
      // 兼容旧格式：旧版 aiAnalyses 存储单个对象而非数组
      let history: AiAnalysis[] = [];
      const existing = state.aiAnalyses[projectId];
      if (Array.isArray(existing)) {
        history = existing;
      } else if (existing != null) {
        // 旧格式单个对象 → 迁移为数组
        history = [existing as unknown as AiAnalysis];
      }
      console.log(
        "[AI:Store] 分析结果已存储 | projectId:",
        projectId,
        "| #",
        history.length + 1,
        "| summaryLen:",
        analysis.response.summary.length,
        "| nextSteps:",
        analysis.response.suggestedNextSteps.length,
      );
      return {
        aiAnalyses: {
          ...state.aiAnalyses,
          [projectId]: [analysis, ...history],
        },
      };
    }),

  clearAiAnalysis: (projectId) =>
    set((state) => {
      console.log("[AI:Store] 清除分析结果 | projectId:", projectId);
      const { [projectId]: _, ...rest } = state.aiAnalyses;
      return { aiAnalyses: rest };
    }),

  setAiLoading: (projectId, loading) =>
    set((state) => {
      console.log("[AI:Store] loading:", loading, "| projectId:", projectId);
      if (loading) {
        return { aiLoading: { ...state.aiLoading, [projectId]: true as const } };
      }
      const { [projectId]: _, ...rest } = state.aiLoading;
      return { aiLoading: rest };
    }),

  addChatMessage: (projectId, message) =>
    set((state) => {
      const existing = state.chatMessages[projectId] ?? [];
      console.log("[Chat:Store] 新增消息 | projectId:", projectId, "| role:", message.role, "| total:", existing.length + 1);
      return {
        chatMessages: {
          ...state.chatMessages,
          [projectId]: [...existing, message],
        },
      };
    }),

  updateSettings: (patch) =>
    set((state) => {
      // 只记录非敏感字段的变更
      const keys = Object.keys(patch).filter((k) => k !== "apiKey");
      if (keys.length > 0) {
        console.log("[Store] updateSettings | keys:", keys.join(", "));
      }
      return {
        settings: { ...state.settings, ...patch },
      };
    }),
}));

// ============================================================
// 派生 selectors（不触发额外渲染的派生数据）
// ============================================================

/** 获取当前激活的完整 Project 对象 */
export function useActiveProject(): Project | null {
  return useAppStore((s) => {
    if (!s.activeProjectId) return null;
    return s.projects.find((p) => p.id === s.activeProjectId) ?? null;
  });
}

const EMPTY_AI_HISTORY: AiAnalysis[] = [];

const EMPTY_STATS = Object.freeze({
  total: 0,
  notStarted: 0,
  inProgress: 0,
  nearingCompletion: 0,
  completed: 0,
});

/** 获取当前激活项目的 AI 分析历史 */
export function useAiHistory(): AiAnalysis[] {
  return useAppStore((s) => {
    if (!s.activeProjectId) return EMPTY_AI_HISTORY;
    const val = s.aiAnalyses[s.activeProjectId];
    if (!val) return EMPTY_AI_HISTORY;
    return Array.isArray(val) ? val : EMPTY_AI_HISTORY;
  });
}

/** 按状态分组统计（浅比对 + 空常量 + 拍平返回值，消除引用抖动） */
export function useProjectStats() {
  return useAppStore(
    useShallow((s) => {
      if (s.projects.length === 0) return EMPTY_STATS;
      let notStarted = 0;
      let inProgress = 0;
      let nearingCompletion = 0;
      let completed = 0;
      for (const p of s.projects) {
        switch (p.status) {
          case "not-started":
            notStarted++;
            break;
          case "in-progress":
            inProgress++;
            break;
          case "nearing-completion":
            nearingCompletion++;
            break;
          case "completed":
            completed++;
            break;
        }
      }
      return {
        total: s.projects.length,
        notStarted,
        inProgress,
        nearingCompletion,
        completed,
      };
    }),
  );
}
