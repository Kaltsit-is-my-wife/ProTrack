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
 * 应用状态持久化（v2 — 分拆存储）
 *
 * 按 09-data-management-principles.md 分类：
 *   - 配置数据（settings）  → tauri-plugin-store → %APPDATA%/app-state.json
 *   - 业务数据（projects/AI/chat） → {dataDir}/projects.json
 *   - 缓存数据（snapshots） → {dataDir}/.project-tracker/cache/snapshots.json
 *   - 模板数据（prompts）  → {dataDir}/prompts.json（由 Rust 命令管理）
 *
 * 启动时自动从各位置恢复，运行时 500ms 防抖自动保存。
 * 首次启动时从旧 app-state.json 自动迁移。
 */

import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore, type AppState, type AiAnalysis } from "@/store/useAppStore";
import type { ProjectSnapshot } from "@/store/useAppStore";

const OLD_STORE_PATH = "app-state.json";
const SAVE_DEBOUNCE = 500;

// 业务数据文件名
const BUSINESS_FILE = "projects.json";
const SNAPSHOTS_CACHE_KEY = "snapshots";

let configStore: Store | null = null;
let configSaveTimer: ReturnType<typeof setTimeout> | null = null;
let businessSaveTimer: ReturnType<typeof setTimeout> | null = null;
let cacheSaveTimer: ReturnType<typeof setTimeout> | null = null;
let saveCount = 0;
/** Rust 返回的系统默认应用数据目录（dataPath 为空时回退到此） */
let defaultDataDir = "";

// ============================================================
// 获取有效 dataDir（用户设置 > 系统默认）
// ============================================================

function getDataDir(): string {
  return useAppStore.getState().settings.dataPath || defaultDataDir;
}

// ============================================================
// 加载 — 配置（从 tauri-plugin-store）
// ============================================================

interface OldPersistedSettings {
  theme?: string;
  apiKey?: string;
  apiEndpoint?: string;
  model?: string;
  defaultDepth?: number;
  dataPath?: string;
  nextStepPresets?: string[];
  nodeSpacing?: number;
  aiHistoryMode?: string;
  suppressLayer1Warning?: boolean;
}

async function loadConfig(): Promise<AppState["settings"] | null> {
  try {
    console.log("[Persistence] 加载配置: app-state.json");
    const s = await Store.load(OLD_STORE_PATH, { defaults: {}, autoSave: false });
    configStore = s;

    // 先尝试新格式（settings 顶层 key）
    let raw = await s.get<OldPersistedSettings>("settings");

    // 若没有，尝试旧格式（嵌套在 state 中）
    if (!raw) {
      const oldState = await s.get<{ settings: OldPersistedSettings }>("state");
      raw = oldState?.settings;
      if (raw) {
        console.log("[Persistence] 从旧格式 state.settings 中恢复配置");
        // 写入新格式
        await s.set("settings", raw);
        await s.save();
      }
    }

    if (!raw) {
      console.log("[Persistence] 配置存档为空，使用默认值");
      return null;
    }

    // 解密敏感字段（兼容旧明文：无 enc:v1: 前缀直接返回原文）
    let apiKey = raw.apiKey ?? "";
    if (apiKey) {
      try {
        apiKey = await invoke<string>("decrypt_setting", { stored: apiKey });
      } catch (e) {
        console.warn("[Persistence] API Key 解密失败，已清除:", e);
        apiKey = "";
      }
    }

    return {
      theme: (raw.theme ?? "system") as "light" | "dark" | "system",
      apiKey,
      apiEndpoint: raw.apiEndpoint ?? "",
      model: raw.model ?? "",
      defaultDepth: raw.defaultDepth ?? 3,
      dataPath: raw.dataPath ?? "",
      nextStepPresets: raw.nextStepPresets ?? [],
      nodeSpacing: raw.nodeSpacing ?? 70,
      aiHistoryMode: (raw.aiHistoryMode ?? "timeline") as "timeline" | "dropdown",
      suppressLayer1Warning: raw.suppressLayer1Warning ?? false,
    };
  } catch (err) {
    console.error("[Persistence] 加载配置失败:", err);
    return null;
  }
}

// ============================================================
// 加载 — 业务数据（从 dataDir/projects.json）
// ============================================================

interface BusinessData {
  projects: AppState["projects"];
  projectTrees: AppState["projectTrees"];
  maxDepthByProject: AppState["maxDepthByProject"];
  aiAnalyses: AppState["aiAnalyses"];
  chatMessages: AppState["chatMessages"];
}

async function loadBusinessData(dataDir: string): Promise<BusinessData | null> {
  if (!dataDir) {
    console.log("[Persistence] dataDir 为空，跳过业务数据加载");
    return null;
  }

  try {
    console.log("[Persistence] 加载业务数据:", dataDir);
    const json = await invoke<string | null>("load_data_file", {
      filename: BUSINESS_FILE,
      dataDir,
    });

    if (!json) {
      console.log("[Persistence] 业务数据文件不存在");
      return null;
    }

    const raw = JSON.parse(json);
    // 基本校验
    if (!raw || !Array.isArray(raw.projects)) {
      console.warn("[Persistence] 业务数据格式异常");
      return null;
    }

    // 迁移旧版 AI 数据：单对象 → 数组
    const rawAi = (raw.aiAnalyses ?? {}) as Record<string, unknown>;
    const migratedAi: Record<string, AiAnalysis[]> = {};
    for (const [id, val] of Object.entries(rawAi)) {
      migratedAi[id] = Array.isArray(val)
        ? (val as AiAnalysis[])
        : [val as AiAnalysis];
    }

    console.log("[Persistence] 业务数据加载成功, 字段:", Object.keys(raw).join(", "));
    return {
      projects: raw.projects ?? [],
      projectTrees: raw.projectTrees ?? {},
      maxDepthByProject: raw.maxDepthByProject ?? {},
      aiAnalyses: migratedAi,
      chatMessages: raw.chatMessages ?? {},
    };
  } catch (err) {
    console.error("[Persistence] 加载业务数据失败:", err);
    return null;
  }
}

// ============================================================
// 加载 — 缓存（从 dataDir/.project-tracker/cache/）
// ============================================================

async function loadCache(dataDir: string): Promise<Record<string, ProjectSnapshot>> {
  if (!dataDir) return {};

  try {
    const json = await invoke<string | null>("load_cache", {
      key: SNAPSHOTS_CACHE_KEY,
      dataDir,
    });

    if (!json) return {};

    const raw = JSON.parse(json);
    return typeof raw === "object" && raw !== null ? raw : {};
  } catch (err) {
    console.error("[Persistence] 加载缓存失败:", err);
    return {};
  }
}

// ============================================================
// 迁移 — 从旧 app-state.json 提取业务数据
// ============================================================

async function migrateFromOldStore(): Promise<{
  business: BusinessData;
  snapshots: Record<string, ProjectSnapshot>;
} | null> {
  try {
    console.log("[Persistence] 尝试从旧格式迁移...");
    const s = await Store.load(OLD_STORE_PATH, { defaults: {}, autoSave: false });
    const raw = await s.get<{
      projects?: unknown[];
      projectTrees?: Record<string, unknown>;
      maxDepthByProject?: Record<string, number>;
      aiAnalyses?: Record<string, unknown>;
      chatMessages?: Record<string, unknown>;
      projectSnapshots?: Record<string, ProjectSnapshot>;
    }>("state");

    if (!raw || !Array.isArray(raw.projects)) {
      console.log("[Persistence] 旧存档为空或格式异常，跳过迁移");
      return null;
    }

    // 迁移 AI 数据格式
    const rawAi = (raw.aiAnalyses ?? {}) as Record<string, unknown>;
    const migratedAi: Record<string, AiAnalysis[]> = {};
    for (const [id, val] of Object.entries(rawAi)) {
      migratedAi[id] = Array.isArray(val)
        ? (val as AiAnalysis[])
        : [val as AiAnalysis];
    }

    const business: BusinessData = {
      projects: raw.projects as AppState["projects"],
      projectTrees: (raw.projectTrees ?? {}) as AppState["projectTrees"],
      maxDepthByProject: raw.maxDepthByProject ?? {},
      aiAnalyses: migratedAi,
      chatMessages: (raw.chatMessages ?? {}) as AppState["chatMessages"],
    };
    const snapshots = raw.projectSnapshots ?? {};

    console.log(
      "[Persistence] 旧格式数据已提取 | projects:",
      business.projects.length,
      "| snapshots:",
      Object.keys(snapshots).length,
    );

    return { business, snapshots };
  } catch (err) {
    console.error("[Persistence] 迁移失败:", err);
    return null;
  }
}

// ============================================================
// 保存 — 配置
// ============================================================

function scheduleConfigSave() {
  if (configSaveTimer) clearTimeout(configSaveTimer);
  configSaveTimer = setTimeout(() => doSaveConfig(), SAVE_DEBOUNCE);
}

async function doSaveConfig() {
  if (!configStore) return;
  try {
    const settings = useAppStore.getState().settings;
    // 加密敏感字段后落盘（Zustand 内存中始终是明文）
    const toSave: Record<string, unknown> = { ...settings };
    if (toSave.apiKey) {
      toSave.apiKey = await invoke<string>("encrypt_setting", {
        plaintext: toSave.apiKey as string,
      });
    }
    await configStore.set("settings", toSave);
    await configStore.save();
    saveCount++;
    console.log("[Persistence] 配置已保存 #" + saveCount);
  } catch (err) {
    console.error("[Persistence] 配置保存失败:", err);
  }
}

// ============================================================
// 保存 — 业务数据
// ============================================================

function scheduleBusinessSave() {
  if (businessSaveTimer) clearTimeout(businessSaveTimer);
  businessSaveTimer = setTimeout(() => doSaveBusiness(), SAVE_DEBOUNCE);
}

async function doSaveBusiness() {
  const dataDir = getDataDir();
  if (!dataDir) return;

  try {
    const state = useAppStore.getState();
    const data: BusinessData = {
      projects: state.projects,
      projectTrees: state.projectTrees,
      maxDepthByProject: state.maxDepthByProject,
      aiAnalyses: state.aiAnalyses,
      chatMessages: state.chatMessages,
    };
    const json = JSON.stringify(data);
    await invoke("save_data_file", {
      filename: BUSINESS_FILE,
      dataDir,
      json,
    });
  } catch (err) {
    console.error("[Persistence] 业务数据保存失败:", err);
  }
}

// ============================================================
// 保存 — 缓存
// ============================================================

function scheduleCacheSave() {
  if (cacheSaveTimer) clearTimeout(cacheSaveTimer);
  cacheSaveTimer = setTimeout(() => doSaveCache(), SAVE_DEBOUNCE);
}

async function doSaveCache() {
  const dataDir = getDataDir();
  if (!dataDir) return;

  try {
    const snapshots = useAppStore.getState().projectSnapshots;
    await invoke("save_cache", {
      key: SNAPSHOTS_CACHE_KEY,
      dataDir,
      json: JSON.stringify(snapshots),
    });
  } catch (err) {
    console.error("[Persistence] 缓存保存失败:", err);
  }
}

// ============================================================
// 初始化（main.tsx 最开头调用）
// ============================================================

export async function initPersistence(): Promise<void> {
  // 0. 解析默认数据目录
  try {
    defaultDataDir = await invoke<string>("get_data_dir");
    console.log("[Persistence] 默认数据目录:", defaultDataDir);
  } catch {
    defaultDataDir = "";
  }

  let business: BusinessData | null = null;
  let snapshots: Record<string, ProjectSnapshot> = {};

  // 1. 加载配置（总是从 app-state.json）
  const config = await loadConfig();

  // 2. 尝试加载业务数据（dataPath 为空的启动阶段用 defaultDataDir 兜底）
  const loadDir = config?.dataPath || defaultDataDir;
  if (loadDir) {
    business = await loadBusinessData(loadDir);
    snapshots = await loadCache(loadDir);
  }

  // 3. 若业务数据为空 → 尝试从旧格式迁移
  if (!business || business.projects.length === 0) {
    const migrated = await migrateFromOldStore();
    if (migrated) {
      business = migrated.business;
      snapshots = migrated.snapshots;
      // 立即写入新位置
      const saveDir = config?.dataPath || defaultDataDir;
      if (saveDir) {
        console.log("[Persistence] 迁移数据写入:", saveDir);
        invoke("save_data_file", {
          filename: BUSINESS_FILE,
          dataDir: saveDir,
          json: JSON.stringify(business),
        }).catch((err) => console.error("[Persistence] 迁移保存业务数据失败:", err));

        invoke("save_cache", {
          key: SNAPSHOTS_CACHE_KEY,
          dataDir: saveDir,
          json: JSON.stringify(snapshots),
        }).catch((err) => console.error("[Persistence] 迁移保存缓存失败:", err));
      }
    }
  }

  // 4. 恢复到 Zustand
  if (business) {
    const snapIds = Object.keys(snapshots);
    const aiIds = Object.keys(business.aiAnalyses);
    const chatIds = Object.keys(business.chatMessages);
    console.log(
      "[Persistence] 状态已恢复:",
      business.projects.length, "个项目,",
      snapIds.length, "个快照,",
      aiIds.length, "个AI分析,",
      chatIds.length, "个聊天记录",
    );
    useAppStore.setState({
      projects: business.projects,
      projectTrees: business.projectTrees,
      maxDepthByProject: business.maxDepthByProject,
      aiAnalyses: business.aiAnalyses,
      chatMessages: business.chatMessages,
      projectSnapshots: snapshots,
    });
  } else {
    console.log("[Persistence] 无业务数据，使用初始状态");
  }

  if (config) {
    useAppStore.setState({ settings: config });
    console.log("[Persistence] 配置已恢复");
  }

  // 5. 订阅变更 → 分拆保存
  useAppStore.subscribe(() => {
    scheduleConfigSave();
    scheduleBusinessSave();
    scheduleCacheSave();
  });
  console.log("[Persistence] 自动保存订阅已注册 (debounce:", SAVE_DEBOUNCE, "ms)");
}
