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

import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  FolderOpen,
  FolderPen,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { safeInvoke } from "@/lib/invoke";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/store/useAppStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

// ============================================================
// 分类定义
// ============================================================

type CategoryKey = "general" | "appearance" | "ai";

interface Category {
  key: CategoryKey;
  label: string;
}

const CATEGORIES: Category[] = [
  { key: "general", label: "通用" },
  { key: "appearance", label: "外观" },
  { key: "ai", label: "AI" },
];

// ============================================================
// Props
// ============================================================

interface SettingsPageProps {
  onBack: () => void;
}

// ============================================================
// SettingsPage
// ============================================================

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("general");
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  // 解析默认数据路径
  const [defaultPath, setDefaultPath] = useState("");
  useEffect(() => {
    invoke<string>("get_data_dir")
      .then(setDefaultPath)
      .catch(() => setDefaultPath(""));
  }, []);

  const effectivePath = settings.dataPath || defaultPath;

  const handleChangePath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择数据存储目录",
    });
    if (selected) {
      updateSettings({ dataPath: selected as string });
    }
  };

  const handleOpenDataDir = () => {
    invoke("open_in_explorer", { path: effectivePath }).catch(console.error);
  };

  const handleClearCache = async () => {
    await safeInvoke("clear_cache", { dataDir: effectivePath }, {
      showSuccess: true,
      successMessage: "缓存已清理",
    });
  };

  const handleExportData = async () => {
    const targetPath = await save({
      defaultPath: "project-tracker-export.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
      title: "导出全部数据",
    });
    if (!targetPath) return; // 用户取消
    await safeInvoke("export_all_data", {
      dataDir: effectivePath,
      targetPath,
    }, {
      showSuccess: true,
      successMessage: "数据导出成功",
    });
  };

  // 预设词条管理
  const [addingPreset, setAddingPreset] = useState(false);
  const [newPreset, setNewPreset] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startAdd = () => {
    setAddingPreset(true);
    setNewPreset("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const commitAdd = () => {
    const trimmed = newPreset.trim();
    if (trimmed && !settings.nextStepPresets.includes(trimmed)) {
      updateSettings({
        nextStepPresets: [...settings.nextStepPresets, trimmed],
      });
    }
    setAddingPreset(false);
    setNewPreset("");
  };

  const removePreset = (item: string) => {
    updateSettings({
      nextStepPresets: settings.nextStepPresets.filter((p) => p !== item),
    });
  };

  // ---- AI 连接测试 ----
  type TestStatus = "idle" | "testing" | "success" | "error";
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");

  // ---- 系统 Prompt（Layer 2） ----
  const [systemPrompt, setSystemPrompt] = useState("");
  const [promptLoaded, setPromptLoaded] = useState(false);
  const [promptSaved, setPromptSaved] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 可用变量
  const PROMPT_VARIABLES = [
    { key: "projectName", label: "项目名称" },
    { key: "projectPath", label: "项目路径" },
    { key: "status", label: "项目状态" },
    { key: "notes", label: "备注" },
    { key: "nextSteps", label: "下一步" },
    { key: "tree", label: "目录树" },
  ];

  // 点击变量按钮 → 在光标位置插入 {key}
  const insertVariable = (key: string) => {
    const ta = promptTextareaRef.current;
    if (!ta) return;
    const tag = `{${key}}`;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = systemPrompt.slice(0, start);
    const after = systemPrompt.slice(end);
    const next = before + tag + after;
    setSystemPrompt(next);
    handlePromptChange(next);
    // 光标移到插入内容之后
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  // 加载已保存的 prompt
  useEffect(() => {
    invoke<string | null>("load_system_prompt", { dataDir: effectivePath })
      .then((text) => {
        if (text !== null) setSystemPrompt(text);
      })
      .catch(() => {})
      .finally(() => setPromptLoaded(true));
  }, [effectivePath]);

  // 防抖自动保存
  const handlePromptChange = (value: string) => {
    setSystemPrompt(value);
    setPromptSaved(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      invoke("save_system_prompt", {
        dataDir: effectivePath,
        promptText: value,
      })
        .then(() => setPromptSaved(true))
        .catch(console.error);
    }, 500);
  };

  // ---- AI 分析系统 Prompt（Layer 2） ----
  const [analysisPrompt, setAnalysisPrompt] = useState("");
  const [analysisPromptLoaded, setAnalysisPromptLoaded] = useState(false);
  const [analysisPromptSaved, setAnalysisPromptSaved] = useState(true);
  const [analysisPromptError, setAnalysisPromptError] = useState<string | null>(
    null,
  );
  const analysisSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const analysisTextareaRef = useRef<HTMLTextAreaElement>(null);
  const analysisValidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    invoke<string | null>("load_analysis_prompt", { dataDir: effectivePath })
      .then((text) => {
        if (text !== null) setAnalysisPrompt(text);
      })
      .catch(() => {})
      .finally(() => setAnalysisPromptLoaded(true));
  }, [effectivePath]);

  // ============================================================
  // 分析提示词格式校验 —— 第一道防线
  // 目标：确保 prompt 能引导 AI 返回正确的结构化 JSON
  // ============================================================
  const validateAnalysisPrompt = (value: string): string | null => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null; // 留空允许，走 L1 兜底

    const issues: string[] = [];

    // ---- 规则 1：必须包含 {tree} 变量 ----
    // 没有目录结构数据，AI 无法进行有意义的项目分析
    if (!/\{tree\}/.test(trimmed)) {
      issues.push(
        "缺少 {tree} 变量 — 没有项目目录结构数据，AI 无法分析项目。请在 prompt 中合适位置插入 {tree} 变量。",
      );
    }

    // ---- 规则 2：必须包含 JSON 格式输出指令 ----
    // 匹配 "返回/输出/回复/给出…JSON"、"JSON 格式/对象"、"必须是/只返回…JSON" 等语义
    const hasJsonOutput =
      /(?:返回|输出|回复|给出|respond|return|output|reply).*JSON/i.test(
        trimmed,
      ) ||
      /JSON.*(?:格式|对象|object|format)/i.test(trimmed) ||
      /(?:必须是|应该是|只.*JSON|仅.*JSON|以JSON)/i.test(trimmed) ||
      /JSON.*(?:输出|返回|回复)/i.test(trimmed);
    if (!hasJsonOutput) {
      issues.push(
        "未明确要求 AI 以 JSON 格式输出 — 请添加类似「只返回 JSON 对象」「以 JSON 格式输出」的指令，否则 AI 可能返回非结构化文本导致解析失败。",
      );
    }

    // ---- 规则 3：至少提及 2 个必需输出字段 ----
    const REQUIRED_FIELDS: { pattern: RegExp; canonical: string }[] = [
      { pattern: /\bsummary\b/i, canonical: "summary" },
      {
        pattern: /\bsuggestedNextSteps\b|\bsuggested_next_steps\b/i,
        canonical: "suggestedNextSteps",
      },
      {
        pattern: /\bstructureInsights\b|\bstructure_insights\b/i,
        canonical: "structureInsights",
      },
      { pattern: /\brisks\b/i, canonical: "risks" },
    ];
    const matchedFields = REQUIRED_FIELDS.filter((f) =>
      f.pattern.test(trimmed),
    ).map((f) => f.canonical);
    const fieldCount = new Set(matchedFields).size;

    if (fieldCount < 2) {
      const allFields = REQUIRED_FIELDS.map((f) => f.canonical).join("、");
      issues.push(
        `输出字段覆盖不足（当前 ${fieldCount} 个，需要 ≥2 个）— 请在 prompt 中明确列出至少 2 个输出字段，确保 AI 返回完整结构。可选字段：${allFields}。`,
      );
    }

    // ---- 规则 4：提示词长度 ≥ 40 字符 ----
    if (trimmed.length < 40) {
      issues.push(
        `提示词过短（${trimmed.length} 字符）— 完整的分析 prompt 通常需要包含项目背景、输出格式说明和字段定义，建议补充完善。`,
      );
    }

    // ---- 规则 5：花括号配对检查（排除变量占位符） ----
    // 移除已知变量占位符 {tree} {projectName} 等，再检查剩余花括号是否配对
    const withoutVars = trimmed.replace(/\{[a-zA-Z]+\}/g, "");
    let braceDepth = 0;
    for (const ch of withoutVars) {
      if (ch === "{") braceDepth++;
      if (ch === "}") braceDepth--;
    }
    if (braceDepth !== 0) {
      const hint =
        braceDepth > 0
          ? `多出 ${braceDepth} 个左括号`
          : `多出 ${-braceDepth} 个右括号`;
      issues.push(
        `JSON 示例中花括号不配对（${hint}）— 请检查代码块或 JSON 模板的括号是否完整，否则 AI 可能模仿错误的格式。`,
      );
    }

    // ---- 汇总 ----
    if (issues.length > 0) {
      return issues.map((s, i) => `${i + 1}. ${s}`).join("\n");
    }
    return null;
  };

  const handleAnalysisPromptChange = (value: string) => {
    setAnalysisPrompt(value);
    setAnalysisPromptSaved(false);

    // 防抖校验（实时反馈，但不打断输入）
    if (analysisValidateTimerRef.current)
      clearTimeout(analysisValidateTimerRef.current);
    analysisValidateTimerRef.current = setTimeout(() => {
      const err = validateAnalysisPrompt(value);
      setAnalysisPromptError(err);
    }, 400);

    // 防抖保存（校验不通过则跳过）
    if (analysisSaveTimerRef.current)
      clearTimeout(analysisSaveTimerRef.current);
    analysisSaveTimerRef.current = setTimeout(() => {
      const err = validateAnalysisPrompt(value);
      setAnalysisPromptError(err);
      if (err) return; // 校验不通过，不保存
      invoke("save_analysis_prompt", {
        dataDir: effectivePath,
        promptText: value,
      })
        .then(() => setAnalysisPromptSaved(true))
        .catch(console.error);
    }, 800);
  };

  const handleTestConnection = async () => {
    console.log("[AI:Test] 开始连接测试 | hasApiKey:", !!settings.apiKey);
    setTestStatus("testing");
    setTestMessage("");
    const t0 = performance.now();
    const result = await safeInvoke<{ ok: boolean; message: string }>(
      "test_ai_connection",
      {
        apiKey: settings.apiKey,
        apiEndpoint: settings.apiEndpoint ?? "",
        model: settings.model ?? "",
      },
      { showError: false }, // 组件自有错误展示
    );
    if (!result) {
      setTestStatus("error");
      setTestMessage("连接测试失败，请检查网络或 API 配置");
      return;
    }
    const elapsed = (performance.now() - t0).toFixed(0);
    console.log(
      "[AI:Test] 测试结果 | ok:",
      result.ok,
      "| elapsed:",
      elapsed + "ms",
      "| message:",
      result.message,
    );
    setTestStatus(result.ok ? "success" : "error");
    setTestMessage(result.message);
  };

  return (
    <div className="app-shell">
      {/* ---- 顶栏 ---- */}
      <header className="top-bar">
        <button
          type="button"
          className="inline-flex items-center gap-1 h-7 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted"
          onClick={onBack}
        >
          <ArrowLeft className="size-3.5" />
          返回
        </button>
        <h1 className="text-lg font-semibold tracking-tight">设置</h1>
      </header>

      {/* ---- 两栏主体 ---- */}
      <div className="settings-body">
        {/* 左栏：分类 */}
        <nav className="settings-nav">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              className={`settings-nav-item ${activeCategory === cat.key ? "is-active" : ""}`}
              onClick={() => setActiveCategory(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </nav>

        {/* 右栏：设置项 */}
        <div className="settings-content">
          {activeCategory === "general" && (
            <div className="settings-section">
              <h2 className="settings-section-title">通用</h2>
              <div className="settings-group">
                <SettingRow label="默认导图深度">
                  <Select
                    value={String(settings.defaultDepth)}
                    onValueChange={(v) => {
                      if (v) updateSettings({ defaultDepth: Number(v) });
                    }}
                  >
                    <SelectTrigger className="settings-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3, 4, 5].map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          深度 {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>

                <Separator />

                <SettingRow
                  label="启动时恢复上次状态"
                  hint="重新打开应用时自动恢复项目和设置"
                >
                  <span className="text-xs text-muted-foreground">已启用</span>
                </SettingRow>

                <Separator />

                <SettingRow
                  label="思维导图节点间距"
                  hint={`${settings.nodeSpacing}px`}
                >
                  <div className="settings-spacing-row">
                    <input
                      type="range"
                      min="30"
                      max="150"
                      step="5"
                      value={settings.nodeSpacing}
                      onChange={(e) =>
                        updateSettings({ nodeSpacing: Number(e.target.value) })
                      }
                      className="settings-range"
                    />
                  </div>
                </SettingRow>

                <Separator />

                <SettingRow
                  label="数据存储路径"
                  hint={effectivePath || "加载中…"}
                >
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="settings-path-btn"
                      onClick={handleChangePath}
                    >
                      <FolderPen className="size-3.5" />
                      更改
                    </button>
                    <button
                      type="button"
                      className="settings-path-btn"
                      onClick={handleOpenDataDir}
                      title="打开数据目录"
                    >
                      <FolderOpen className="size-3.5" />
                    </button>
                  </div>
                </SettingRow>

                <Separator />

                <div className="settings-row">
                  <div className="settings-row-label">
                    <span className="settings-row-title">数据管理</span>
                    <span className="settings-row-hint">
                      清理缓存或导出全部数据
                    </span>
                  </div>
                  <div className="settings-row-control">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="settings-path-btn"
                        onClick={handleClearCache}
                      >
                        清理缓存
                      </button>
                      <button
                        type="button"
                        className="settings-path-btn"
                        onClick={handleExportData}
                      >
                        导出全部数据
                      </button>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* 下一步选项管理 */}
                <div className="settings-preset-mgr">
                  <div className="settings-preset-header">
                    <span className="settings-row-title">下一步选项管理</span>
                    <button
                      type="button"
                      className="settings-preset-add-btn"
                      onClick={startAdd}
                      title="添加词条"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  {addingPreset && (
                    <input
                      ref={inputRef}
                      type="text"
                      className="settings-preset-input"
                      placeholder="输入新词条，Enter 确认"
                      value={newPreset}
                      onChange={(e) => setNewPreset(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitAdd();
                        if (e.key === "Escape") {
                          setAddingPreset(false);
                          setNewPreset("");
                        }
                      }}
                      onBlur={commitAdd}
                    />
                  )}
                  <div className="settings-preset-list">
                    {(settings.nextStepPresets ?? []).map((item) => (
                      <span key={item} className="settings-preset-tag">
                        <span className="settings-preset-tag-text">{item}</span>
                        <button
                          type="button"
                          className="settings-preset-tag-remove"
                          onClick={() => removePreset(item)}
                          title="删除"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeCategory === "appearance" && (
            <div className="settings-section">
              <h2 className="settings-section-title">外观</h2>
              <div className="settings-group">
                <SettingRow label="主题模式">
                  <Select
                    value={settings.theme}
                    onValueChange={(v) => {
                      if (v)
                        updateSettings({
                          theme: v as "light" | "dark" | "system",
                        });
                    }}
                  >
                    <SelectTrigger className="settings-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">跟随系统</SelectItem>
                      <SelectItem value="light">浅色</SelectItem>
                      <SelectItem value="dark">深色</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>

                <Separator />

                <SettingRow label="语言" hint="界面显示语言（暂未开放）">
                  <span className="text-xs text-muted-foreground">
                    简体中文
                  </span>
                </SettingRow>
              </div>
            </div>
          )}

          {activeCategory === "ai" && (
            <div className="settings-section">
              <h2 className="settings-section-title">AI</h2>
              <div className="settings-group">
                <SettingRow label="API Key" hint="用于调用 AI 服务的密钥">
                  <input
                    type="password"
                    className="settings-input"
                    placeholder="sk-…"
                    value={settings.apiKey}
                    onChange={(e) => updateSettings({ apiKey: e.target.value })}
                  />
                </SettingRow>

                <Separator />

                <SettingRow
                  label="API 端点"
                  hint="OpenAI 兼容 API 的接口地址，留空使用 .env 配置"
                >
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="https://api.openai.com/v1"
                    value={settings.apiEndpoint ?? ""}
                    onChange={(e) =>
                      updateSettings({ apiEndpoint: e.target.value })
                    }
                  />
                </SettingRow>

                <Separator />

                <SettingRow
                  label="模型"
                  hint="使用的 AI 模型名称，留空使用 .env 配置"
                >
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="gpt-4o / deepseek-v4-flash / claude-sonnet-5"
                    value={settings.model ?? ""}
                    onChange={(e) => updateSettings({ model: e.target.value })}
                  />
                </SettingRow>

                <Separator />

                <div className="settings-row">
                  <div className="settings-row-label">
                    <span className="settings-row-title">连接测试</span>
                    <span className="settings-row-hint">
                      验证 API 密钥是否有效
                    </span>
                  </div>
                  <div className="settings-row-control">
                    <div className="settings-test-control">
                      <button
                        type="button"
                        className="settings-test-btn"
                        onClick={handleTestConnection}
                        disabled={testStatus === "testing"}
                      >
                        {testStatus === "testing" && (
                          <Loader2 className="size-3.5 settings-test-spinner" />
                        )}
                        {testStatus === "testing" ? "测试中…" : "测试连接"}
                      </button>
                      {testStatus !== "idle" && (
                        <div
                          className={`settings-test-result is-${testStatus}`}
                        >
                          {testStatus === "testing" ? (
                            <span className="text-xs text-muted-foreground">
                              正在向 AI 服务发送测试请求…
                            </span>
                          ) : (
                            <span className="text-xs">{testMessage}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                <SettingRow
                  label="历史记录呈现"
                  hint="AI 分析历史记录的展示方式"
                >
                  <Select
                    value={settings.aiHistoryMode ?? "timeline"}
                    onValueChange={(v) => {
                      if (v)
                        updateSettings({
                          aiHistoryMode: v as "timeline" | "dropdown",
                        });
                    }}
                  >
                    <SelectTrigger className="settings-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="timeline">时间轴</SelectItem>
                      <SelectItem value="dropdown">下拉选择</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>

                <Separator />

                <div className="settings-prompt-section">
                  {/* 标题 */}
                  <span className="settings-row-title">
                    AI 对话提示词（Layer 2）
                  </span>

                  {/* 说明 */}
                  <span
                    className="settings-row-hint"
                    style={{ display: "block", marginTop: 4 }}
                  >
                    所有项目的 AI 对话都会使用此提示词。留空则使用内置兜底模板。
                  </span>

                  {/* 变量插入按钮 */}
                  <div
                    className="flex items-center gap-1.5 flex-wrap"
                    style={{ marginTop: 14 }}
                  >
                    <span className="text-[10px] text-muted-foreground">
                      变量：
                    </span>
                    {PROMPT_VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        className="inline-flex items-center h-5 px-1.5 rounded text-[10px] font-mono bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        onClick={() => insertVariable(v.key)}
                        title={`插入 {${v.key}} — ${v.label}`}
                      >
                        {`{${v.key}}`}
                      </button>
                    ))}
                  </div>

                  {/* 编辑区 — 居中 97% */}
                  {promptLoaded ? (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        marginTop: 8,
                      }}
                    >
                      <textarea
                        ref={promptTextareaRef}
                        className="font-mono text-xs leading-relaxed rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        style={{
                          width: "97%",
                          minHeight: 200,
                          resize: "vertical",
                        }}
                        placeholder="点击上方变量标签插入动态内容，或点击「填入默认模板」获取模板…"
                        value={systemPrompt}
                        onChange={(e) => handlePromptChange(e.target.value)}
                        rows={12}
                        spellCheck={false}
                      />
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground py-4">
                      加载中…
                    </div>
                  )}

                  {/* 底部操作 */}
                  <div
                    className="flex items-center justify-between"
                    style={{ marginTop: 6 }}
                  >
                    <button
                      type="button"
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                      onClick={() => {
                        const tpl = [
                          "你是一个专业的项目开发助手，正在帮助用户管理一个软件项目。",
                          "请始终根据下方的「项目信息」和「目录结构」来理解用户的问题，并给出实用的建议。",
                          "",
                          "---",
                          "",
                          "## 项目信息",
                          "",
                          "- **项目名**：{projectName}",
                          "- **路径**：{projectPath}",
                          "- **状态**：{status}",
                          "- **下一步**：{nextSteps}",
                          "- **备注**：{notes}",
                          "",
                          "## 目录结构",
                          "",
                          "{tree}",
                          "",
                          "## 规则",
                          "",
                          "使用中文回复，代码片段保留原文。",
                          "回答简洁、可操作，结合项目上下文。",
                          "",
                          "---",
                          "",
                          "（用户可在项目详情面板中设定「AI 项目规则」，将自动追加在下方并优先遵守。）",
                        ].join("\n");
                        setSystemPrompt(tpl);
                        handlePromptChange(tpl);
                      }}
                    >
                      填入默认模板
                    </button>
                    {promptSaved ? (
                      <span className="text-[10px] text-green-600 dark:text-green-400">
                        ✓ 已保存
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        …
                      </span>
                    )}
                  </div>
                </div>

                <Separator />

                {/* ====== AI 分析提示词 ====== */}
                <div className="settings-prompt-section">
                  <span className="settings-row-title">
                    AI 分析提示词（Layer 2）
                  </span>
                  <span
                    className="settings-row-hint"
                    style={{ display: "block", marginTop: 4 }}
                  >
                    AI 分析项目结构时使用的提示词。留空则使用内置兜底模板。
                  </span>

                  <div
                    className="flex items-center gap-1.5 flex-wrap"
                    style={{ marginTop: 14 }}
                  >
                    <span className="text-[10px] text-muted-foreground">
                      变量：
                    </span>
                    {PROMPT_VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        className="inline-flex items-center h-5 px-1.5 rounded text-[10px] font-mono bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        onClick={() => {
                          const ta = analysisTextareaRef.current;
                          if (!ta) return;
                          const tag = `{${v.key}}`;
                          const s = ta.selectionStart;
                          const e = ta.selectionEnd;
                          const next =
                            analysisPrompt.slice(0, s) +
                            tag +
                            analysisPrompt.slice(e);
                          setAnalysisPrompt(next);
                          handleAnalysisPromptChange(next);
                          setTimeout(() => {
                            ta.focus();
                            ta.setSelectionRange(
                              s + tag.length,
                              s + tag.length,
                            );
                          }, 0);
                        }}
                        title={`插入 {${v.key}} — ${v.label}`}
                      >
                        {`{${v.key}}`}
                      </button>
                    ))}
                  </div>

                  {analysisPromptLoaded ? (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        marginTop: 8,
                      }}
                    >
                      <textarea
                        ref={analysisTextareaRef}
                        className="font-mono text-xs leading-relaxed rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        style={{
                          width: "95%",
                          minHeight: 180,
                          resize: "vertical",
                        }}
                        placeholder="点击上方变量标签插入动态内容，或点击「填入默认模板」获取模板…"
                        value={analysisPrompt}
                        onChange={(e) =>
                          handleAnalysisPromptChange(e.target.value)
                        }
                        rows={10}
                        spellCheck={false}
                      />
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground py-4">
                      加载中…
                    </div>
                  )}

                  {/* 校验错误提示 */}
                  {analysisPromptError && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: "6px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        lineHeight: 1.6,
                        whiteSpace: "pre-line",
                        color: "#dc2626",
                        backgroundColor: "rgb(254 226 226 / 0.6)",
                        border: "1px solid rgb(254 202 202)",
                      }}
                    >
                      ⚠ {analysisPromptError}
                    </div>
                  )}

                  <div
                    className="flex items-center justify-between"
                    style={{ marginTop: 6 }}
                  >
                    <button
                      type="button"
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                      onClick={() => {
                        setAnalysisPromptError(null); // 填入模板，清除错误
                        const tpl = [
                          "你是一个专业的项目文件管理助手。请分析以下项目的目录结构，给出结构化的分析结果。",
                          "",
                          "---",
                          "",
                          "## 项目信息",
                          "",
                          "- **项目名**：{projectName}",
                          "- **路径**：{projectPath}",
                          "- **状态**：{status}",
                          "- **下一步**：{nextSteps}",
                          "- **备注**：{notes}",
                          "",
                          "## 目录结构",
                          "",
                          "{tree}",
                          "",
                          "## 要求",
                          "",
                          "给出 JSON 格式的分析报告，包含 summary、suggestedNextSteps、structureInsights、risks 四个字段。",
                          "文件整理方案由单独的 AI 调用生成，此处无需包含 fileOrganization。",
                          "使用中文回复，只返回 JSON。",
                        ].join("\n");
                        setAnalysisPrompt(tpl);
                        handleAnalysisPromptChange(tpl);
                      }}
                    >
                      填入默认模板
                    </button>
                    {analysisPromptSaved ? (
                      <span className="text-[10px] text-green-600 dark:text-green-400">
                        ✓ 已保存
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        …
                      </span>
                    )}
                  </div>
                </div>

                <Separator />

                <SettingRow
                  label="兜底提示词提醒"
                  hint="关闭后将不再弹出 Layer 1 兜底提示词的警告气泡"
                >
                  <button
                    type="button"
                    role="switch"
                    className={`settings-toggle ${!settings.suppressLayer1Warning ? "is-on" : "is-off"}`}
                    aria-checked={!settings.suppressLayer1Warning}
                    onClick={() =>
                      updateSettings({
                        suppressLayer1Warning: !settings.suppressLayer1Warning,
                      })
                    }
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </SettingRow>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SettingRow
// ============================================================

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <span className="settings-row-title">{label}</span>
        {hint && <span className="settings-row-hint">{hint}</span>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}
