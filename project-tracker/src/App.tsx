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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Settings,
  FolderOpen,
  ChevronDown,
  Trash2,
  RefreshCw,
  Sparkles,
  Pen,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type OnSelectionChangeFunc,
} from "reactflow";
import "reactflow/dist/style.css";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  useAppStore,
  useActiveProject,
  useAiHistory,
} from "@/store/useAppStore";
import type { ProjectStatus } from "@/types/project";
import { PROJECT_STATUS_LABELS } from "@/types/project";
import type { DirNode } from "@/types/directory";
import { getDirName } from "@/types/directory";
import { usePanelResize } from "@/hooks/usePanelResize";
import { useVerticalResize } from "@/hooks/useVerticalResize";
import { useTheme } from "@/hooks/useTheme";
import { layoutMindMap, type MindMapNodeData } from "@/lib/layoutMindMap";
import { filterChildren } from "@/lib/filterRules";
import { buildFingerprint } from "@/lib/fingerprint";
import {
  analyzeProjectCore,
  analyzeProjectFileOrg,
  type AnalyzeResponse,
  type AnalyzeCoreResponse,
} from "@/lib/ai";
import { SettingsPage } from "@/components/SettingsPage";
import { HiddenFilesDialog } from "@/components/HiddenFilesDialog";
import { NodeContextMenu } from "@/components/NodeContextMenu";
import { ChatPanel } from "@/components/ChatPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ============================================================
// 常量
// ============================================================

const DEPTH_OPTIONS = [
  { value: "0", label: "仅根目录" },
  { value: "1", label: "深度 1" },
  { value: "2", label: "深度 2" },
  { value: "3", label: "深度 3" },
  { value: "4", label: "深度 4" },
  { value: "5", label: "深度 5" },
];

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

// ============================================================
// 自定义思维导图节点
// ============================================================
function MindMapNode({ data, selected }: NodeProps<MindMapNodeData>) {
  const collapsedPaths = useAppStore((s) => s.collapsedPaths);
  const toggleCollapse = useAppStore((s) => s.toggleNodeCollapse);
  const isCollapsed = collapsedPaths.includes(data.path);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleCollapse(data.path);
  };

  const handleToggleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <div
      className={`mindmap-node ${selected ? "is-selected" : ""} ${data.isDir ? "is-dir" : "is-file"}`}
      title={data.path}
    >
      <Handle type="target" position={Position.Left} className="!bg-border" />

      {/* 折叠/展开按钮（仅目录节点） */}
      {data.isDir ? (
        <button
          type="button"
          className="mindmap-node-toggle"
          onClick={handleToggle}
          onDoubleClick={handleToggleDoubleClick}
          title={isCollapsed ? "展开子节点" : "收起子节点"}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`mindmap-node-chevron ${isCollapsed ? "" : "is-open"}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      ) : (
        <span className="mindmap-node-toggle-spacer" />
      )}

      <span className="mindmap-node-icon">
        {isCollapsed ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        ) : data.isDir ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <path d="M12 10v8M9 14h6" strokeWidth="1.5" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )}
      </span>
      <span className="mindmap-node-label">{data.label}</span>
      {data.childCount > 0 && !isCollapsed && (
        <span className="mindmap-node-badge">{data.childCount}</span>
      )}
      <Handle type="source" position={Position.Right} className="!bg-border" />
    </div>
  );
}

// ============================================================
// DetailPanel — 右侧面板（标签页：项目详情 | AI 分析）
// ============================================================

function DetailPanel({
  corePartial,
  fileOrgPartial,
}: {
  corePartial: AnalyzeCoreResponse | null;
  fileOrgPartial: string | null;
}) {
  const activeProject = useActiveProject();
  const updateProject = useAppStore((s) => s.updateProject);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const presets = useAppStore((s) => s.settings.nextStepPresets);

  // 标签页状态
  const [activeTab, setActiveTab] = useState<"details" | "ai">("details");

  // 垂直拆分比例
  const vResize = useVerticalResize({ initialPercent: 70 });

  // 预设词条下拉
  const [presetOpen, setPresetOpen] = useState(false);
  const [addingPreset, setAddingPreset] = useState(false);
  const [newPreset, setNewPreset] = useState("");

  // ---- 项目规则（Layer 3） ----
  const [projectRules, setProjectRules] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);

  // 切换项目时加载规则
  useEffect(() => {
    if (!activeProject) {
      setProjectRules("");
      return;
    }
    invoke<string | null>("load_project_rules", {
      projectPath: activeProject.path,
    })
      .then((text) => setProjectRules(text ?? ""))
      .catch(() => setProjectRules(""));
    setRulesOpen(false);
  }, [activeProject?.id]);

  const handleRulesChange = (value: string) => {
    if (!activeProject) return;
    setProjectRules(value);
    invoke("save_project_rules", {
      projectPath: activeProject.path,
      rules: value,
    }).catch(console.error);
  };

  if (!activeProject) {
    return (
      <>
        <div className="panel-section-main" data-panel="details">
          <div className="panel-header">
            <h2 className="panel-title">项目详情</h2>
          </div>
          <div className="panel-body">
            <p className="panel-placeholder">
              在左侧选择一个项目
              <br />
              即可查看和编辑项目详情
            </p>
          </div>
        </div>
        <div className="panel-section-future" data-panel="ai-chat" />
      </>
    );
  }

  return (
    <div className="panel-right-inner" ref={vResize.containerRef}>
      {/* ---- 上半部分：标签页内容 ---- */}
      <div
        className="panel-section-main"
        style={{ flex: `0 0 ${vResize.percent}%` }}
      >
        {/* 标签栏 */}
        <div className="panel-tabs">
          <button
            type="button"
            className={`panel-tab ${activeTab === "details" ? "is-active" : ""}`}
            onClick={() => setActiveTab("details")}
          >
            项目详情
          </button>
          <button
            type="button"
            className={`panel-tab ${activeTab === "ai" ? "is-active" : ""}`}
            onClick={() => setActiveTab("ai")}
          >
            AI 分析
          </button>
        </div>

        {/* 内容区 */}
        <div className="panel-body tab-content">
          {activeTab === "details" ? (
            <div className="detail-body">
              {/* ======== 1. 状态栏 ======== */}
              <div className="detail-section">
                <label className="detail-label">项目状态</label>
                <Select
                  value={activeProject.status}
                  onValueChange={(v) => {
                    if (v)
                      updateProject(activeProject.id, {
                        status: v as ProjectStatus,
                      });
                  }}
                >
                  <SelectTrigger className="detail-status-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(PROJECT_STATUS_LABELS) as [
                        ProjectStatus,
                        string,
                      ][]
                    ).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator className="detail-divider" />

              {/* ======== 2. 下一步工作 ======== */}
              <div className="detail-section">
                <label className="detail-label">下一步工作</label>
                <div className="detail-next-row">
                  <input
                    type="text"
                    className="detail-input"
                    placeholder="输入下一步计划..."
                    value={activeProject.nextSteps}
                    onChange={(e) =>
                      updateProject(activeProject.id, {
                        nextSteps: e.target.value,
                      })
                    }
                  />
                  <div className="detail-preset-wrap">
                    <button
                      type="button"
                      className="detail-preset-btn"
                      onClick={() => setPresetOpen(!presetOpen)}
                      title="选择预设词条"
                    >
                      <ChevronDown
                        className={`detail-preset-chevron ${presetOpen ? "is-open" : ""}`}
                      />
                    </button>
                    {presetOpen && (
                      <>
                        <div
                          className="detail-preset-overlay"
                          onClick={() => setPresetOpen(false)}
                        />
                        <div className="detail-preset-dropdown">
                          {presets.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              className="detail-preset-item"
                              onClick={() => {
                                updateProject(activeProject.id, {
                                  nextSteps: preset,
                                });
                                setPresetOpen(false);
                              }}
                            >
                              {preset}
                            </button>
                          ))}
                          <div className="detail-preset-divider" />
                          {addingPreset ? (
                            <input
                              type="text"
                              className="detail-preset-new-input"
                              placeholder="输入新选项，Enter 保存"
                              autoFocus
                              value={newPreset}
                              onChange={(e) => setNewPreset(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const t = newPreset.trim();
                                  if (t && !presets.includes(t)) {
                                    updateSettings({
                                      nextStepPresets: [...presets, t],
                                    });
                                  }
                                  setNewPreset("");
                                  setAddingPreset(false);
                                }
                                if (e.key === "Escape") {
                                  setNewPreset("");
                                  setAddingPreset(false);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <button
                              type="button"
                              className="detail-preset-item detail-preset-add"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAddingPreset(true);
                              }}
                            >
                              + 添加选项…
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <Separator className="detail-divider" />

              {/* ======== 3. AI 对话规则 ======== */}
              <div className="detail-section">
                <label className="detail-label">AI 对话规则</label>
                <div className="detail-next-row">
                  <div className="detail-input flex items-center text-muted-foreground truncate">
                    {projectRules
                      ? projectRules.split("\n")[0].slice(0, 50) +
                        (projectRules.length > 50 ? "…" : "")
                      : "未设定"}
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center size-8 rounded-md border border-input text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer flex-shrink-0"
                    onClick={() => setRulesOpen(true)}
                    title="编辑 AI 对话规则"
                  >
                    <Pen className="size-3.5" />
                  </button>
                </div>
              </div>

              <Separator className="detail-divider" />

              {/* ======== 4. 备注 ======== */}
              <div className="detail-section detail-section-notes">
                <label className="detail-label">备注</label>
                <Textarea
                  className="detail-textarea"
                  placeholder="输入备注…"
                  value={activeProject.notes}
                  onChange={(e) => {
                    updateProject(activeProject.id, {
                      notes: e.target.value,
                    });
                  }}
                  rows={4}
                />
              </div>

              {/* 规则编辑弹窗 */}
              {rulesOpen && (
                <RulesEditDialog
                  initialRules={projectRules}
                  onSave={(text) => {
                    setProjectRules(text);
                    handleRulesChange(text);
                  }}
                  onClose={() => setRulesOpen(false)}
                />
              )}
            </div>
          ) : (
            <ErrorBoundary name="AI分析面板">
              <AiAnalysisContent
                corePartial={corePartial}
                fileOrgPartial={fileOrgPartial}
              />
            </ErrorBoundary>
          )}
        </div>
      </div>

      {/* ---- 垂直分隔线 ---- */}
      <div
        className={`panel-resize-handle-h ${vResize.dragging ? "is-dragging" : ""}`}
        onMouseDown={vResize.handleMouseDown}
      >
        <div className="panel-resize-handle-h-bar" />
      </div>

      {/* ---- 下半部分：AI 对话框 ---- */}
      <div
        className="panel-section-future is-active"
        data-panel="ai-chat"
        style={{ flex: `0 0 ${100 - vResize.percent}%` }}
      >
        <ErrorBoundary name="AI对话">
          <ChatPanel />
        </ErrorBoundary>
      </div>
    </div>
  );
}

// ============================================================
// AiAnalysisContent — AI 分析标签页内容
// ============================================================
function AiAnalysisContent({
  corePartial,
  fileOrgPartial,
}: {
  corePartial: AnalyzeCoreResponse | null;
  fileOrgPartial: string | null;
}) {
  const history = useAiHistory();
  const aiHistoryMode = useAppStore((s) => s.settings.aiHistoryMode);
  const loading = useAppStore((s) => {
    if (!s.activeProjectId) return false;
    return !!s.aiLoading[s.activeProjectId];
  });

  // dropdown 模式：当前选中查看的历史索引（0 = 最新）
  const [selectedIdx, setSelectedIdx] = useState(0);
  // timeline 模式：折叠展开
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());

  const activeAnalysis = history[selectedIdx] ?? null;
  const isLatest = selectedIdx === 0;

  // ---- 正在分析中：显示双加载动画 ----
  if (loading) {
    return (
      <div className="ai-panel-body">
        {/* 核心分析加载 / 结果 */}
        {corePartial ? (
          <div className="ai-results">
            <CoreResultCard core={corePartial} />
          </div>
        ) : (
          <div className="ai-loading">
            <Sparkles className="size-5 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground mt-2">
              AI 正在分析项目概况、建议、洞察与风险...
            </p>
          </div>
        )}

        <hr className="my-3 border-border" />

        {/* 文件整理方案加载 / 结果 */}
        {fileOrgPartial ? (
          <div className="ai-section">
            <h4 className="ai-section-title">文件整理方案</h4>
            <pre className="ai-file-org-tree">{fileOrgPartial}</pre>
          </div>
        ) : (
          <div className="ai-loading">
            <Sparkles className="size-5 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground mt-2">
              AI 正在生成文件整理方案...
            </p>
          </div>
        )}
      </div>
    );
  }

  if (!activeAnalysis) {
    return (
      <div className="ai-panel-body">
        <p className="panel-placeholder" style={{ fontSize: 12 }}>
          点击顶栏 ✨ AI 分析
          <br />
          获取项目智能建议
        </p>
      </div>
    );
  }

  return (
    <div className="ai-panel-body">
      {/* ---- 模式切换区 ---- */}
      {history.length > 1 && aiHistoryMode === "dropdown" && (
        <div className="ai-history-dropdown-row">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            查看版本：
          </span>
          <select
            className="ai-history-select"
            value={selectedIdx}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
          >
            {history.map((entry, i) => (
              <option key={entry.analyzedAt} value={i}>
                {i === 0 ? "最新" : ""}{" "}
                {new Date(entry.analyzedAt).toLocaleString("zh-CN")}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ---- 分析结果 ---- */}
      <div className="ai-results">
        <AiResultCard analysis={activeAnalysis} isLatest={isLatest} />

        {/* timeline 模式：历史时间轴 */}
        {history.length > 1 && aiHistoryMode === "timeline" && (
          <div className="ai-section">
            <h4 className="ai-section-title">历史记录</h4>
            <div className="ai-history-list">
              {history.slice(1).map((entry, i) => {
                const idx = i + 1;
                const isExpanded = expandedIdx.has(idx);
                return (
                  <div key={entry.analyzedAt} className="ai-history-item">
                    <button
                      type="button"
                      className="ai-history-header"
                      onClick={() => {
                        setExpandedIdx((prev) => {
                          const next = new Set(prev);
                          if (next.has(idx)) next.delete(idx);
                          else next.add(idx);
                          return next;
                        });
                      }}
                    >
                      <ChevronDown
                        className={`size-3 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                      />
                      <span className="ai-history-date">
                        {new Date(entry.analyzedAt).toLocaleString("zh-CN")}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="ai-history-body">
                        <AiResultCard analysis={entry} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- 分析结果卡片（复用组件，留后手扩展字段） ----

// ---- 核心分析结果卡片（分段加载时使用） ----
function CoreResultCard({ core }: { core: AnalyzeCoreResponse }) {
  return (
    <>
      <div className="ai-section">
        <p className="ai-summary">{core.summary}</p>
      </div>
      {core.suggestedNextSteps.length > 0 && (
        <div className="ai-section">
          <h4 className="ai-section-title">建议下一步</h4>
          <ul className="ai-list">
            {core.suggestedNextSteps.map((s, i) => (
              <li key={i} className="ai-list-item">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {core.structureInsights.length > 0 && (
        <div className="ai-section">
          <h4 className="ai-section-title">结构洞察</h4>
          <ul className="ai-list">
            {core.structureInsights.map((s, i) => (
              <li key={i} className="ai-list-item">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {core.risks.length > 0 && (
        <div className="ai-section">
          <h4 className="ai-section-title">风险与建议</h4>
          <ul className="ai-list">
            {core.risks.map((s, i) => (
              <li key={i} className="ai-list-item">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// ---- 完整分析结果卡片 ----
function AiResultCard({
  analysis,
  isLatest,
}: {
  analysis: { analyzedAt: number; response: AnalyzeResponse };
  isLatest?: boolean;
}) {
  const r = analysis.response;
  return (
    <>
      {isLatest && (
        <div className="ai-section">
          <p className="ai-summary">{r.summary}</p>
        </div>
      )}
      {!isLatest && (
        <p className="ai-summary" style={{ fontSize: 11, marginBottom: 8 }}>
          {r.summary}
        </p>
      )}
      {r.suggestedNextSteps.length > 0 && (
        <div className="ai-section">
          <h4 className="ai-section-title">建议下一步</h4>
          <ul className="ai-list">
            {r.suggestedNextSteps.map((s, i) => (
              <li key={i} className="ai-list-item">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.structureInsights.length > 0 && (
        <div className="ai-section">
          <h4 className="ai-section-title">结构洞察</h4>
          <ul className="ai-list">
            {r.structureInsights.map((s, i) => (
              <li key={i} className="ai-list-item">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.risks.length > 0 && (
        <div className="ai-section">
          <h4 className="ai-section-title">风险与建议</h4>
          <ul className="ai-list">
            {r.risks.map((s, i) => (
              <li key={i} className="ai-list-item">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.fileOrganization && (
        <div className="ai-section">
          <h4 className="ai-section-title">文件整理方案</h4>
          <pre className="ai-file-org-tree">{r.fileOrganization}</pre>
        </div>
      )}
      <p className="ai-timestamp">
        {new Date(analysis.analyzedAt).toLocaleString("zh-CN")}
      </p>
    </>
  );
}

// ============================================================
// HiddenMarkerNode — 被隐藏文件指示节点
// ============================================================

function HiddenMarkerNode({ data }: NodeProps<MindMapNodeData>) {
  return (
    <div className="mindmap-node mindmap-node-hidden" title={data.path}>
      <Handle type="target" position={Position.Left} className="!bg-border" />
      <span
        className="mindmap-node-icon"
        style={{ color: "hsl(var(--muted-foreground))" }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="m14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" x2="23" y1="1" y2="23" />
        </svg>
      </span>
      <span className="mindmap-node-label">{data.label}</span>
      <Handle type="source" position={Position.Right} className="!bg-border" />
    </div>
  );
}

// ============================================================
// App
// ============================================================

// ============================================================
// RulesEditDialog — AI 对话规则编辑弹窗
// ============================================================

function RulesEditDialog({
  initialRules,
  onSave,
  onClose,
}: {
  initialRules: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialRules);

  const handleSave = () => {
    onSave(text);
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>AI 对话规则</DialogTitle>
          <DialogDescription>
            针对此项目的 AI 行为约束，将追加在全局提示词之后生效。
          </DialogDescription>
        </DialogHeader>
        <Textarea
          className="min-h-[180px] font-mono text-xs leading-relaxed"
          placeholder={`例如：\n- 使用 React 18 + TypeScript\n- 不要修改 src/legacy/ 下的文件\n- 数据库使用 PostgreSQL，禁止使用 ORM 的 raw SQL 以外的查询方式`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          spellCheck={false}
        />
        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            type="button"
            className="inline-flex items-center h-7 px-3 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="inline-flex items-center h-7 px-3 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function App() {
  // eslint-disable-next-line react-compiler/react-compiler
  const nodeTypes = useMemo(
    () => ({ mindmap: MindMapNode, hiddenMarker: HiddenMarkerNode }),
    [],
  );

  // ---- 主题 ----
  useTheme();

  // ---- 页面路由 ----
  const [currentPage, setCurrentPage] = useState<"main" | "settings">("main");
  // 追踪：是否刚从设置页返回（用于触发变更检测）
  const justReturnedFromSettingsRef = useRef(false);

  // AI 分析双调用局部状态（支持分段加载展示）
  const [corePartial, setCorePartial] = useState<AnalyzeCoreResponse | null>(
    null,
  );
  const [fileOrgPartial, setFileOrgPartial] = useState<string | null>(null);

  // ---- Zustand ----
  const projects = useAppStore((s) => s.projects);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const maxDepthByProject = useAppStore((s) => s.maxDepthByProject);
  const defaultDepth = useAppStore((s) => s.settings.defaultDepth);
  const maxDepth = activeProjectId
    ? (maxDepthByProject[activeProjectId] ?? defaultDepth)
    : defaultDepth;
  const setMaxDepth = useAppStore((s) => s.setMaxDepth);
  const clearCollapsed = useAppStore((s) => s.clearCollapsed);
  const setActiveProject = useAppStore((s) => s.setActiveProject);
  const projectTrees = useAppStore((s) => s.projectTrees);
  const collapsedPaths = useAppStore((s) => s.collapsedPaths);
  const addProject = useAppStore((s) => s.addProject);
  const setProjectTree = useAppStore((s) => s.setProjectTree);
  const setHiddenFiles = useAppStore((s) => s.setHiddenFiles);

  // 隐藏文件对话框
  const [hiddenDialogPath, setHiddenDialogPath] = useState<string | null>(null);

  // ---- 右键上下文菜单 ----
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    nodePath: string;
    isCollapsed: boolean;
    isDir: boolean;
  } | null>(null);

  // 子树重排：存储要重排布局的节点路径，在 setNodes 中消费
  const subtreeRelayoutPathRef = useRef<string | null>(null);
  // 布局版本号（子树重排时递增以触发 layout effect）
  const [layoutVersion, setLayoutVersion] = useState(0);

  // 选中节点追踪（用于删除按钮）
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
  const handleSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selected }) => setSelectedNodes(selected),
    [],
  );

  const hiddenFiles = useAppStore((s) => s.hiddenFiles);
  const staleProjects = useAppStore((s) => s.staleProjects);
  const nodeSpacing = useAppStore((s) => s.settings.nodeSpacing);
  const aiLoading = useAppStore((s) => s.aiLoading);
  const setAiAnalysis = useAppStore((s) => s.setAiAnalysis);
  const setAiLoading = useAppStore((s) => s.setAiLoading);

  // ---- React Flow ----
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  // 实时镜像 nodes/edges，用于快照保存（避免 effect 依赖导致循环）
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const isEmpty = nodes.length === 0;
  const hasProjects = projects.length > 0;

  // ==========================================================
  // 工具：保存当前项目快照（同步节点 + 异步指纹）
  // ==========================================================

  const saveCurrentSnapshot = useCallback((projectId: string) => {
    const store = useAppStore.getState();
    const tree = store.projectTrees[projectId];
    const ns = nodesRef.current;
    const es = edgesRef.current;
    if (!tree) {
      console.log(
        "[Snapshot] saveCurrentSnapshot: 跳过，无 tree, projectId:",
        projectId,
      );
      return;
    }
    if (ns.length === 0) {
      console.log(
        "[Snapshot] saveCurrentSnapshot: 跳过，nodes 为空, projectId:",
        projectId,
      );
      return;
    }

    // 保留已有指纹（指纹只在 ELK 初次生成时写入，不在离开时覆盖）
    const existingFp = store.projectSnapshots[projectId]?.dirFingerprint;

    console.log(
      "[Snapshot] 保存快照（保留已有指纹）, projectId:",
      projectId,
      "nodes:",
      ns.length,
      "hasFp:",
      !!existingFp,
    );
    store.saveProjectSnapshot(projectId, {
      savedAt: Date.now(),
      treeRootPath: tree.path,
      nodes: ns,
      edges: es,
      collapsedPaths: store.collapsedPaths,
      hiddenFiles: store.hiddenFiles,
      maxDepth:
        store.maxDepthByProject[projectId] ?? store.settings.defaultDepth,
      dirFingerprint: existingFp,
    });
  }, []);

  // ==========================================================
  // 工具：异步扫描目录，将指纹写入快照（ELK 完成后调用）
  // ==========================================================

  const updateSnapshotFingerprint = useCallback((projectId: string) => {
    const store = useAppStore.getState();
    const tree = store.projectTrees[projectId];
    if (!tree) return;

    const seq = ++fingerprintSeqRef.current;
    console.log("[Fingerprint] 开始异步扫描, seq:", seq, "path:", tree.path);
    invoke<DirNode>("scan_directory", { path: tree.path, maxDepth: 5 })
      .then((freshTree) => {
        if (seq !== fingerprintSeqRef.current) {
          console.log("[Fingerprint] 扫描结果被丢弃（竞态）, seq:", seq);
          return;
        }
        const fp = buildFingerprint(freshTree);
        console.log(
          "[Fingerprint] 扫描完成, seq:",
          seq,
          "文件数:",
          JSON.parse(fp).length,
        );
        const latest = useAppStore.getState();
        const existing = latest.projectSnapshots[projectId];
        if (existing) {
          latest.saveProjectSnapshot(projectId, {
            ...existing,
            dirFingerprint: fp,
          });
          console.log("[Fingerprint] 指纹已写入快照, projectId:", projectId);
        }
      })
      .catch((err) => console.error("[Fingerprint] 扫描失败:", err));
  }, []);

  // ==========================================================
  // 工具：后台扫描目录，比对指纹，标记 stale
  // ==========================================================

  const checkProjectStale = useCallback((projectId: string) => {
    const store = useAppStore.getState();
    const snap = store.projectSnapshots[projectId];
    if (!snap) {
      console.log("[StaleCheck] 跳过：无快照, projectId:", projectId);
      return;
    }
    if (!snap.dirFingerprint) {
      console.log(
        "[StaleCheck] 跳过：快照无指纹, projectId:",
        projectId,
        "snapKeys:",
        Object.keys(snap),
      );
      return;
    }
    const tree = store.projectTrees[projectId];
    if (!tree) {
      console.log("[StaleCheck] 跳过：无目录树, projectId:", projectId);
      return;
    }

    console.log(
      "[StaleCheck] 开始后台扫描, projectId:",
      projectId,
      "path:",
      tree.path,
      "已存指纹长度:",
      snap.dirFingerprint.length,
    );
    invoke<DirNode>("scan_directory", { path: tree.path, maxDepth: 5 })
      .then((freshTree) => {
        const fp = buildFingerprint(freshTree);
        const oldCount = JSON.parse(snap.dirFingerprint!).length;
        const newCount = JSON.parse(fp).length;
        const changed = fp !== snap.dirFingerprint;
        console.log(
          "[StaleCheck] 扫描完成, 旧文件数:",
          oldCount,
          "新文件数:",
          newCount,
          "有变更:",
          changed,
        );
        if (changed) {
          useAppStore.getState().markProjectStale(projectId);
          console.log("[StaleCheck] ✅ 已标记 stale, projectId:", projectId);
        } else {
          useAppStore.getState().clearProjectStale(projectId);
          console.log(
            "[StaleCheck] 指纹一致，清除 stale, projectId:",
            projectId,
          );
        }
      })
      .catch((err) => console.error("[StaleCheck] 扫描失败:", err));
  }, []);

  // ==========================================================
  // 窗口关闭前保存当前项目快照
  // ==========================================================

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeProjectId) {
        console.log(
          "[BeforeUnload] 窗口关闭前保存快照, projectId:",
          activeProjectId,
        );
        const store = useAppStore.getState();
        const tree = store.projectTrees[activeProjectId];
        const ns = nodesRef.current;
        const es = edgesRef.current;
        if (tree && ns.length > 0) {
          // 保留已有指纹（关闭时无法等异步扫描）
          const existingFp =
            store.projectSnapshots[activeProjectId]?.dirFingerprint;
          store.saveProjectSnapshot(activeProjectId, {
            savedAt: Date.now(),
            treeRootPath: tree.path,
            nodes: ns,
            edges: es,
            collapsedPaths: store.collapsedPaths,
            hiddenFiles: store.hiddenFiles,
            maxDepth:
              store.maxDepthByProject[activeProjectId] ??
              store.settings.defaultDepth,
            dirFingerprint: existingFp,
          });
          console.log(
            "[BeforeUnload] 快照已保存, nodes:",
            ns.length,
            "hasFp:",
            !!existingFp,
          );
        } else {
          console.log(
            "[BeforeUnload] 跳过：tree:",
            !!tree,
            "nodesLen:",
            ns.length,
          );
        }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeProjectId]);

  // ==========================================================
  // 从设置页返回 → 触发变更检测
  // ==========================================================

  useEffect(() => {
    if (currentPage === "main" && justReturnedFromSettingsRef.current) {
      justReturnedFromSettingsRef.current = false;
      console.log("[Page] 从设置页返回, activeProjectId:", activeProjectId);
      if (activeProjectId) {
        const proj = useAppStore
          .getState()
          .projects.find((p) => p.id === activeProjectId);
        if (proj) {
          invoke("ensure_project_tracker_dir", {
            projectPath: proj.path,
          }).catch(() => {});
        }
        checkProjectStale(activeProjectId);
      } else {
        console.log("[Page] 返回时无活跃项目，跳过变更检测");
      }
    }
  }, [currentPage, activeProjectId, checkProjectStale]);

  // 删除节点 → 加入 hiddenFiles
  const handleNodesDelete = useCallback(
    (deleted: Node[]) => {
      const active = useAppStore.getState().activeProjectId
        ? useAppStore
            .getState()
            .projects.find(
              (p) => p.id === useAppStore.getState().activeProjectId,
            )
        : null;
      const rootPath = active?.path;

      const updated = { ...hiddenFiles };
      for (const node of deleted) {
        if (node.type === "hiddenMarker") continue;
        // 根节点不允许删除
        if (rootPath && node.data.path === rootPath) continue;
        const fullPath = node.data.path;
        const lastSep = Math.max(
          fullPath.lastIndexOf("\\"),
          fullPath.lastIndexOf("/"),
        );
        const parentDir = fullPath.substring(0, lastSep);
        const fileName = fullPath.substring(lastSep + 1);
        const list = updated[parentDir] ?? [];
        if (!list.includes(fileName)) {
          updated[parentDir] = [...list, fileName];
        }
      }
      setHiddenFiles(updated);
    },
    [hiddenFiles, setHiddenFiles],
  );

  // 删除按钮：删除当前选中的节点（跳过 hiddenMarker 和根节点）
  const handleDeleteSelected = useCallback(() => {
    const active = useAppStore.getState().activeProjectId
      ? useAppStore
          .getState()
          .projects.find((p) => p.id === useAppStore.getState().activeProjectId)
      : null;
    const rootPath = active?.path;
    const targets = selectedNodes.filter(
      (n) => n.type !== "hiddenMarker" && n.data.path !== rootPath,
    );
    if (targets.length === 0) return;
    console.log("[Delete] 删除选中节点 | count:", targets.length);
    setNodes((nds) => nds.filter((n) => !targets.some((s) => s.id === n.id)));
    setEdges((eds) =>
      eds.filter(
        (e) => !targets.some((s) => s.id === e.source || s.id === e.target),
      ),
    );
    handleNodesDelete(targets);
    setSelectedNodes([]);
  }, [selectedNodes, setNodes, setEdges, handleNodesDelete]);

  // 前一个活动项目（用于快照保存 + 检测项目切换）
  const prevActiveRef = useRef<string | null>(null);

  // 防止异步指纹扫描竞态
  const fingerprintSeqRef = useRef(0);

  // ==========================================================
  // 离开项目 → 保存快照
  // ==========================================================

  useEffect(() => {
    const prev = prevActiveRef.current;
    if (prev && prev !== activeProjectId) {
      console.log("[Switch] 离开项目, prev:", prev, "new:", activeProjectId);
      saveCurrentSnapshot(prev);
    } else {
      console.log(
        "[Switch] 初始进入或同项目切换, prev:",
        prev,
        "new:",
        activeProjectId,
      );
    }
    prevActiveRef.current = activeProjectId;
  }, [activeProjectId, saveCurrentSnapshot]);

  // 布局锁：防止并发布局竞态覆盖
  const layoutLock = useRef(0);

  // ---- 面板宽度 ----
  const leftPanel = usePanelResize({
    initialWidth: 280,
    minWidth: 180,
    maxWidth: 500,
    direction: 1,
  });
  const rightPanel = usePanelResize({
    initialWidth: 320,
    minWidth: 220,
    maxWidth: 600,
    direction: -1,
  });

  // ==========================================================
  // 进入设置页 → 先保存当前快照，返回时触发变更检测
  // ==========================================================

  const goToSettings = useCallback(() => {
    console.log("[Page] 进入设置页, activeProjectId:", activeProjectId);
    if (activeProjectId) {
      saveCurrentSnapshot(activeProjectId);
    }
    justReturnedFromSettingsRef.current = true;
    setCurrentPage("settings");
  }, [activeProjectId, saveCurrentSnapshot]);

  // ==========================================================
  // 深度变化 → 重新布局
  // ==========================================================

  const handleDepthChange = useCallback(
    (value: string | null) => {
      if (value && activeProjectId) {
        setMaxDepth(activeProjectId, Number(value));
        clearCollapsed(); // 深度变化时重置当前项目的折叠状态
      }
    },
    [setMaxDepth, clearCollapsed, activeProjectId],
  );

  // ==========================================================
  // 全局刷新：重新扫描目录 → 清快照 → 重跑 ELK
  // ==========================================================

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!activeProjectId) return;
    const store = useAppStore.getState();
    const project = store.projects.find((p) => p.id === activeProjectId);
    if (!project) return;

    try {
      setRefreshing(true);
      invoke("ensure_project_tracker_dir", { projectPath: project.path }).catch(
        () => {},
      );

      // 1. 重新扫描目录
      const tree = await invoke<DirNode>("scan_directory", {
        path: project.path,
        maxDepth: 5,
      });

      // 2. 重新计算过滤规则
      const initHidden: Record<string, string[]> = {};
      function collectHidden(node: DirNode) {
        const children = node.children ?? [];
        if (children.length > 0) {
          const result = filterChildren(children);
          if (result.removed.length > 0) {
            initHidden[node.path] = result.removed;
          }
        }
        for (const c of children) {
          if (c.isDir) collectHidden(c);
        }
      }
      collectHidden(tree);

      // 3. 一次 setState 批量更新：清快照 + 清 stale + 更新树 + 重置隐藏 + 重置折叠
      //    避免多次渲染触发中间态的 ELK 重排
      const { [activeProjectId]: _, ...restSnapshots } = store.projectSnapshots;
      const { [activeProjectId]: __, ...restStale } = store.staleProjects;
      useAppStore.setState({
        projectSnapshots: restSnapshots,
        staleProjects: restStale,
        projectTrees: { ...store.projectTrees, [activeProjectId]: tree },
        hiddenFiles: initHidden,
        collapsedPaths: [],
      });
    } catch (err) {
      console.error("[Refresh] 扫描失败:", err);
    } finally {
      setRefreshing(false);
    }
  }, [activeProjectId]);

  // ==========================================================
  // AI 分析
  // ==========================================================

  const handleAiAnalyze = useCallback(async () => {
    if (!activeProjectId) return;
    const store = useAppStore.getState();
    const project = store.projects.find((p) => p.id === activeProjectId);
    const tree = store.projectTrees[activeProjectId];
    if (!project || !tree) return;

    console.log("[AI:UI] 用户触发 AI 并行分析 | projectId:", activeProjectId);
    invoke("ensure_project_tracker_dir", { projectPath: project.path }).catch(
      () => {},
    );
    setAiLoading(activeProjectId, true);
    setCorePartial(null);
    setFileOrgPartial(null);

    try {
      const dataDir = useAppStore.getState().settings.dataPath;

      // 并行两次调用，各自完成时立即更新 UI
      const [core, fileOrg] = await Promise.all([
        analyzeProjectCore(project, tree, dataDir).then((r) => {
          setCorePartial(r);
          return r;
        }),
        analyzeProjectFileOrg(project, tree, dataDir).then((r) => {
          setFileOrgPartial(r.fileOrganization);
          return r;
        }),
      ]);

      setAiAnalysis(activeProjectId, {
        analyzedAt: Date.now(),
        response: {
          summary: core.summary,
          suggestedNextSteps: core.suggestedNextSteps,
          structureInsights: core.structureInsights,
          risks: core.risks,
          fileOrganization: fileOrg.fileOrganization,
        },
      });
      console.log("[AI:UI] ✅ AI 并行分析完成并已存储");
    } catch (err) {
      console.error("[AI:UI] ❌ AI 分析失败:", err);
    } finally {
      setAiLoading(activeProjectId, false);
    }
  }, [activeProjectId, setAiAnalysis, setAiLoading]);

  const handleAddProject = useCallback(async () => {
    console.log("[DEBUG] handleAddProject called");
    try {
      console.log("[DEBUG] calling open()...");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择要追踪的项目目录",
      });
      console.log("[DEBUG] open() returned:", selected);

      if (!selected) {
        console.log("[DEBUG] user cancelled");
        return;
      }

      const dirPath = selected as string;
      const name = getDirName(dirPath);
      console.log("[DEBUG] selected path:", dirPath);

      // 用较大深度扫描，后续可通过 depth 选择器过滤显示
      const scanDepth = 5;
      console.log("[DEBUG] scanning with depth:", scanDepth);
      const tree = await invoke<DirNode>("scan_directory", {
        path: dirPath,
        maxDepth: scanDepth,
      });
      console.log(
        "[DEBUG] scan done, root:",
        tree.name,
        "children:",
        tree.children?.length ?? 0,
      );

      console.log("[DEBUG] calling addProject...");
      addProject({
        name,
        path: dirPath,
        status: "not-started",
        nextSteps: "",
        notes: "",
      });
      console.log("[DEBUG] addProject returned");

      // 获取刚添加的 project id（addProject 在内部生成）
      const all = useAppStore.getState().projects;
      console.log(
        "[DEBUG] store has",
        all.length,
        "projects:",
        all.map((p) => p.name),
      );
      const latest = all[all.length - 1];
      console.log("[DEBUG] latest:", latest?.id, latest?.name);

      if (latest) {
        // 首次扫描时运行过滤规则，初始化 hiddenFiles（只做这一次，后续由用户手动管理）
        const initHidden: Record<string, string[]> = {};
        function collectHidden(node: DirNode) {
          const children = node.children ?? [];
          if (children.length > 0) {
            const result = filterChildren(children);
            if (result.removed.length > 0) {
              initHidden[node.path] = result.removed;
            }
          }
          for (const c of children) {
            if (c.isDir) collectHidden(c);
          }
        }
        collectHidden(tree);
        if (Object.keys(initHidden).length > 0) {
          setHiddenFiles(initHidden);
        }

        console.log("[DEBUG] setting projectTree and activeProject...");
        setProjectTree(latest.id, tree);
        setActiveProject(latest.id);
        invoke("ensure_project_tracker_dir", { projectPath: dirPath }).catch(
          () => {},
        );
        console.log(
          "[DEBUG] project added, id:",
          latest.id,
          "activeProjectId now:",
          useAppStore.getState().activeProjectId,
        );
      } else {
        console.error("[DEBUG] latest is undefined! all:", all);
      }
    } catch (err) {
      console.error("[DEBUG] add project failed:", err);
    }
  }, [addProject, setProjectTree, setActiveProject]);

  // ==========================================================
  // 点击项目列表 → 切换 activeProject
  // ==========================================================

  const handleSelectProject = useCallback(
    (id: string) => {
      console.log("[Click] 点击项目列表项, id:", id);
      setActiveProject(id);
      const proj = useAppStore.getState().projects.find((p) => p.id === id);
      if (proj) {
        invoke("ensure_project_tracker_dir", { projectPath: proj.path }).catch(
          () => {},
        );
      }
    },
    [setActiveProject],
  );

  // ==========================================================
  // 右键节点 → 弹出上下文菜单
  // ==========================================================

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node<MindMapNodeData>) => {
      event.preventDefault();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
        nodePath: node.data.path,
        isCollapsed: collapsedPaths.includes(node.data.path),
        isDir: node.data.isDir,
      });
    },
    [collapsedPaths],
  );

  // 子树重排：触发 ELK 重排，但只更新选中节点子树的布局
  const handleRelayoutSubtree = useCallback(
    (nodePath: string) => {
      console.log("[Relayout] 子树重排:", nodePath);
      if (activeProjectId) {
        useAppStore.getState().clearProjectSnapshot(activeProjectId);
      }
      subtreeRelayoutPathRef.current = nodePath;
      setLayoutVersion((v) => v + 1);
    },
    [activeProjectId],
  );

  // ==========================================================
  // 双击节点 → 在文件管理器中打开
  // ==========================================================

  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node<MindMapNodeData>) => {
      if (node.type === "hiddenMarker") {
        // 提取父目录路径（去掉 ::__hidden__ 后缀）
        const parentPath = node.data.path.replace("::__hidden__", "");
        setHiddenDialogPath(parentPath);
        return;
      }
      invoke("open_in_explorer", { path: node.data.path }).catch((err) =>
        console.error("打开目录失败:", err),
      );
    },
    [],
  );

  // 布局 effect 专用的"上一次项目"追踪（独立于 save effect 的 prevActiveRef）
  const lastLayoutProjectRef = useRef<string | null>(null);
  // 标记"快照恢复触发的重跑"，跳过以避免误清除快照或 ELK 覆盖
  const isRestoringRef = useRef(false);

  // ==========================================================
  // tree / depth 变化 → elkjs 布局（快照优先）
  // ==========================================================

  useEffect(() => {
    const justSwitched = lastLayoutProjectRef.current !== activeProjectId;

    const tree = activeProjectId ? projectTrees[activeProjectId] : null;

    if (!tree) {
      lastLayoutProjectRef.current = activeProjectId;
      setNodes([]);
      setEdges([]);
      return;
    }

    // 快照恢复触发的重跑：跳过，避免覆盖或误清除
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      lastLayoutProjectRef.current = activeProjectId;
      return;
    }

    // ---- 情况 1：刚切到本项目，且有有效快照 → 直接恢复 ----
    if (justSwitched && activeProjectId) {
      const snap = useAppStore.getState().projectSnapshots[activeProjectId];
      console.log(
        "[Layout] 项目切换检测, activeProjectId:",
        activeProjectId,
        "hasSnap:",
        !!snap,
        "snapKeys:",
        snap ? Object.keys(snap) : "N/A",
      );
      if (snap && snap.treeRootPath === tree.path) {
        console.log(
          "[Layout] 恢复快照, nodes:",
          snap.nodes.length,
          "hasFingerprint:",
          !!snap.dirFingerprint,
        );
        lastLayoutProjectRef.current = activeProjectId;
        setNodes(snap.nodes);
        setEdges(snap.edges);
        // 同步恢复 store 中的视图状态（会触发本 effect 重跑，由 isRestoringRef 跳过）
        isRestoringRef.current = true;
        const s = useAppStore.getState();
        useAppStore.setState({
          collapsedPaths: snap.collapsedPaths,
          hiddenFiles: snap.hiddenFiles,
          maxDepthByProject: {
            ...s.maxDepthByProject,
            [activeProjectId]: snap.maxDepth,
          },
        });

        // 后台扫描：比对目录变更，不一致时标记 stale
        console.log("[Layout] 触发异步变更检测...");
        checkProjectStale(activeProjectId);

        return;
      }
      // 快照无效（目录可能变更了），清除残留
      if (snap) {
        console.log(
          "[Layout] 快照 treeRootPath 不匹配，清除, snapPath:",
          snap.treeRootPath,
          "treePath:",
          tree.path,
        );
        useAppStore.getState().clearProjectSnapshot(activeProjectId);
      }
      // 无快照的新项目：重置 collapsedPaths（可能残留上一个项目的值）
      console.log("[Layout] 无有效快照，重置 collapsedPaths，运行 ELK");
      useAppStore.setState({ collapsedPaths: [] });
    }

    // ---- 情况 2：非切换触发（depth/collapsed/hiddenFiles 变更）→ 清除快照 ----
    if (!justSwitched && activeProjectId) {
      const existingSnap =
        useAppStore.getState().projectSnapshots[activeProjectId];
      if (existingSnap) {
        useAppStore.getState().clearProjectSnapshot(activeProjectId);
      }
    }

    lastLayoutProjectRef.current = activeProjectId;

    // ---- 运行 ELK ----
    let cancelled = false;
    const lock = ++layoutLock.current;
    const elkProjectId = activeProjectId; // 捕获 ELK 发起时的项目 ID

    // 使用 getState() 获取最新值
    const latestHidden = useAppStore.getState().hiddenFiles;

    console.log(
      "[DEBUG] layoutMindMap starting, lock:",
      lock,
      "maxDepth:",
      maxDepth,
    );
    layoutMindMap(tree, {
      maxDepth,
      hiddenFiles: latestHidden,
      nodeSpacing,
    })
      .then(({ nodes: newNodes, edges: newEdges }) => {
        if (cancelled || lock !== layoutLock.current) {
          console.log(
            "[DEBUG] layoutMindMap stale result, lock:",
            lock,
            "current:",
            layoutLock.current,
          );
          return;
        }
        console.log(
          "[DEBUG] layoutMindMap done, nodes:",
          newNodes.length,
          "edges:",
          newEdges.length,
        );

        // 位置保留：已存在的节点保持当前位置 + hidden 状态
        // 直接基于 nodesRef.current 计算最终数组（避免 callback 在异步中失效）
        const currentNodes = nodesRef.current;
        const existingMap = new Map(currentNodes.map((n: Node) => [n.id, n]));
        const newMap = new Map(newNodes.map((n: Node) => [n.id, n]));

        // 子树重排：移除要重排的子树节点，让它们使用 ELK 新位置
        const relayoutPath = subtreeRelayoutPathRef.current;
        subtreeRelayoutPathRef.current = null;
        const oldPositions: Record<string, string> = {};
        let clearedCount = 0;
        if (relayoutPath) {
          for (const [id, node] of existingMap) {
            if (
              id !== relayoutPath &&
              (id.startsWith(relayoutPath + "\\") ||
                id.startsWith(relayoutPath + "/") ||
                id.startsWith(relayoutPath + "::"))
            ) {
              oldPositions[id] =
                node.position.x.toFixed(0) + "," + node.position.y.toFixed(0);
              existingMap.delete(id);
              clearedCount++;
            }
          }
          console.log(
            "[SubtreeRelayout] path:",
            relayoutPath,
            "| cleared children:",
            clearedCount,
          );
        }

        const finalNodes = newNodes.map((nn) => {
          const cur = existingMap.get(nn.id);
          if (cur) return { ...nn, position: cur.position, hidden: cur.hidden };

          const parentEdge = newEdges.find((e) => e.target === nn.id);
          if (parentEdge) {
            const parentCur = existingMap.get(parentEdge.source);
            const parentNew = newMap.get(parentEdge.source);
            if (parentCur && parentNew) {
              const dx = parentCur.position.x - parentNew.position.x;
              const dy = parentCur.position.y - parentNew.position.y;
              const finalPos = { x: nn.position.x + dx, y: nn.position.y + dy };
              if (relayoutPath && nn.id.startsWith(relayoutPath)) {
                const old = oldPositions[nn.id] ?? "NEW";
                console.log(
                  "[SubtreeRelayout]",
                  nn.id.split("\\").pop(),
                  "| old:",
                  old,
                  "→ new:",
                  finalPos.x.toFixed(0) + "," + finalPos.y.toFixed(0),
                );
              }
              return { ...nn, position: finalPos };
            }
          }
          if (relayoutPath && nn.id.startsWith(relayoutPath)) {
            console.log(
              "[SubtreeRelayout] FALLBACK:",
              nn.id.split("\\").pop(),
              "| pos:",
              nn.position.x.toFixed(0) + "," + nn.position.y.toFixed(0),
            );
          }
          return nn;
        });

        setNodes(finalNodes);
        setEdges(newEdges);

        // ELK 完成后：确保快照存在 → 补指纹（指纹代表"导图生成时"的目录状态）
        if (elkProjectId) {
          const snapStore = useAppStore.getState();
          const hasSnap = !!snapStore.projectSnapshots[elkProjectId];
          console.log(
            "[Layout] ELK 完成, projectId:",
            elkProjectId,
            "已有快照:",
            hasSnap,
          );
          if (!hasSnap) {
            // 首次 ELK：直接用 ELK 结果创建快照（不用 saveCurrentSnapshot，因为 nodesRef 还是旧值）
            console.log("[Layout] 首次创建快照, nodes:", newNodes.length);
            snapStore.saveProjectSnapshot(elkProjectId, {
              savedAt: Date.now(),
              treeRootPath: tree.path,
              nodes: newNodes,
              edges: newEdges,
              collapsedPaths: snapStore.collapsedPaths,
              hiddenFiles: snapStore.hiddenFiles,
              maxDepth:
                snapStore.maxDepthByProject[elkProjectId] ??
                snapStore.settings.defaultDepth,
            });
          }
          updateSnapshotFingerprint(elkProjectId);
        }
      })
      .catch((err) => {
        console.error("[DEBUG] layoutMindMap failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeProjectId,
    maxDepth,
    projectTrees,
    hiddenFiles,
    nodeSpacing,
    setNodes,
    setEdges,
    layoutVersion,
  ]);

  // ==========================================================
  // 折叠/展开：切换节点 hidden 状态（不触发 ELK）
  // ==========================================================

  useEffect(() => {
    if (!activeProjectId) return;
    console.log(
      "[Collapse] visibility toggle, collapsed:",
      collapsedPaths.length,
    );

    setNodes((currentNodes) => {
      if (currentNodes.length === 0) return currentNodes;
      let changed = false;
      const updated = currentNodes.map((n) => {
        const shouldHide = collapsedPaths.some(
          (cp) =>
            n.id !== cp &&
            (n.id.startsWith(cp + "\\") ||
              n.id.startsWith(cp + "/") ||
              n.id.startsWith(cp + "::")),
        );
        const curHidden = n.hidden === true;
        if (shouldHide !== curHidden) {
          changed = true;
          return { ...n, hidden: shouldHide };
        }
        return n;
      });
      if (changed) console.log("[Collapse] updated node visibility");
      return changed ? updated : currentNodes;
    });

    // 边：target 在折叠子树中则隐藏
    setEdges((currentEdges) => {
      if (currentEdges.length === 0) return currentEdges;
      let changed = false;
      const updated = currentEdges.map((e) => {
        const targetHidden = collapsedPaths.some(
          (cp) =>
            e.target !== cp &&
            (e.target.startsWith(cp + "\\") ||
              e.target.startsWith(cp + "/") ||
              e.target.startsWith(cp + "::")),
        );
        const curHidden = e.hidden === true;
        if (targetHidden !== curHidden) {
          changed = true;
          return { ...e, hidden: targetHidden };
        }
        return e;
      });
      return changed ? updated : currentEdges;
    });
  }, [collapsedPaths, activeProjectId, setNodes, setEdges]);

  // ==========================================================
  // Render
  // ==========================================================

  // ---- 设置页面 ----
  if (currentPage === "settings") {
    return (
      <ErrorBoundary
        name="设置页面"
        fallback={
          <div className="app-shell">
            <header className="top-bar">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold tracking-tight">
                  Project Tracker
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setCurrentPage("main")}
                >
                  <Settings className="size-3.5" />
                  返回主页
                </Button>
              </div>
            </header>
            <div className="main-content">
              <div className="error-boundary-fallback">
                <div className="error-boundary-icon">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <p className="error-boundary-text">设置页面加载失败</p>
                <p className="error-boundary-hint">[设置页面]</p>
                <button
                  type="button"
                  className="error-boundary-retry-btn"
                  onClick={() => setCurrentPage("main")}
                >
                  返回主页
                </button>
              </div>
            </div>
          </div>
        }
      >
        <SettingsPage onBack={() => setCurrentPage("main")} />
      </ErrorBoundary>
    );
  }

  // ---- 主页面 ----
  return (
    <div className="app-shell">
      {/* ========== Top Bar ========== */}
      <header className="top-bar">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">
            Project Tracker
          </h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            v0
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* 全局刷新 */}
          <button
            type="button"
            className="inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
            onClick={handleRefresh}
            disabled={!activeProjectId || refreshing}
            title="重新扫描目录并刷新思维导图"
          >
            <RefreshCw
              className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">
              导图深度
            </label>
            <Select value={String(maxDepth)} onValueChange={handleDepthChange}>
              <SelectTrigger className="h-7 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPTH_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator orientation="vertical" className="h-5" />

          {/* AI 分析按钮 */}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-7 px-2 text-xs font-medium rounded-md transition-colors disabled:opacity-40"
            style={{
              color: "hsl(var(--muted-foreground))",
              background: "transparent",
            }}
            onClick={handleAiAnalyze}
            disabled={
              !activeProjectId ||
              (activeProjectId ? !!aiLoading[activeProjectId] : false)
            }
            title={activeProjectId ? "AI 分析当前项目" : "请先选择一个项目"}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "hsl(var(--muted))";
              e.currentTarget.style.color = "hsl(var(--foreground))";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "hsl(var(--muted-foreground))";
            }}
          >
            <Sparkles
              className={`size-3.5 ${activeProjectId && aiLoading[activeProjectId] ? "animate-spin" : ""}`}
            />
            {activeProjectId && aiLoading[activeProjectId]
              ? "分析中"
              : "AI 分析"}
          </button>

          <Separator orientation="vertical" className="h-5" />

          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={goToSettings}
          >
            <Settings className="size-3.5" />
            设置
          </Button>
        </div>
      </header>

      {/* ========== Three-Column Body ========== */}
      <div className="main-content">
        {/* ---- 左栏 ---- */}
        <aside
          className="panel-left"
          style={{ width: leftPanel.width, minWidth: 180 }}
        >
          <div className="panel-section-main" data-panel="projects">
            <div className="panel-header">
              <h2 className="panel-title">项目目录</h2>
              <button
                type="button"
                className="inline-flex items-center gap-1 h-6 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                onClick={handleAddProject}
              >
                <FolderOpen className="size-3" />
                添加
              </button>
            </div>
            <div className="panel-body">
              <ErrorBoundary name="项目列表">
                {hasProjects ? (
                  <ul className="space-y-1">
                    {projects.map((p) => {
                      const isStale = p.id in staleProjects;
                      return (
                        <li
                          key={p.id}
                          className={`rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors ${
                            p.id === activeProjectId
                              ? "bg-muted font-medium"
                              : "hover:bg-muted/60"
                          }`}
                          onClick={() => handleSelectProject(p.id)}
                        >
                          <div className="flex items-center gap-1.5 font-medium truncate">
                            {isStale && (
                              <span
                                className="inline-block size-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: "#f59e0b" }}
                                title="目录内容已变更，点击刷新按钮更新"
                              />
                            )}
                            {p.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {p.path}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="panel-placeholder">
                    点击"添加"按钮
                    <br />
                    选择要追踪的项目目录
                  </p>
                )}
              </ErrorBoundary>
            </div>
          </div>

          <div className="panel-section-future" data-panel="ai-chat" />
        </aside>

        {/* 分隔线 */}
        <div
          className={`panel-resize-handle ${leftPanel.isDragging ? "is-dragging" : ""}`}
          onMouseDown={leftPanel.handleMouseDown}
        />

        {/* ---- 中栏 ---- */}
        <main className="panel-center">
          <div className="panel-center-header">
            <span className="text-xs text-muted-foreground">
              思维导图 · 深度 {maxDepth}
              {activeProjectId && (
                <span className="ml-2 text-[10px]">
                  ({nodes.length} 个节点)
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {selectedNodes.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  已选 {selectedNodes.length}
                </span>
              )}
              <button
                type="button"
                className="panel-center-del-btn"
                onClick={handleDeleteSelected}
                disabled={selectedNodes.length === 0}
                title="删除选中节点（或按 Del 键）"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="panel-center-body">
            <ErrorBoundary name="思维导图">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodesDelete={handleNodesDelete}
                onSelectionChange={handleSelectionChange}
                onNodeDoubleClick={handleNodeDoubleClick}
                onNodeContextMenu={handleNodeContextMenu}
                nodeTypes={nodeTypes}
                minZoom={0.1}
                maxZoom={4}
                fitView
                nodesDraggable
                nodesConnectable={false}
                elementsSelectable
                panOnScroll
                zoomOnScroll
                deleteKeyCode={["Backspace", "Delete"]}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={20}
                  size={1}
                  color="hsl(var(--muted-foreground) / 0.15)"
                />
                <Controls className="rf-controls" showInteractive={false} />
              </ReactFlow>

              {isEmpty && (
                <div className="mindmap-placeholder">
                  <div className="mindmap-placeholder-icon">
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-muted-foreground/40"
                    >
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="5" cy="12" r="2" />
                      <circle cx="19" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                      <path d="M12 7v3" />
                      <path d="M7 12H5zm12 0h-2z" />
                      <path d="M12 17v-3" />
                    </svg>
                  </div>
                  <p className="mindmap-placeholder-text">
                    选择一个项目
                    <br />
                    即可在此查看目录结构思维导图
                  </p>
                  <p className="mindmap-placeholder-hint">
                    鼠标拖拽平移 · 滚轮缩放 · 双击节点打开目录
                  </p>
                </div>
              )}
            </ErrorBoundary>
          </div>
        </main>

        {/* 分隔线 */}
        <div
          className={`panel-resize-handle ${rightPanel.isDragging ? "is-dragging" : ""}`}
          onMouseDown={rightPanel.handleMouseDown}
        />

        {/* ---- 右栏 ---- */}
        <aside
          className="panel-right"
          style={{ width: rightPanel.width, minWidth: 220 }}
        >
          <DetailPanel
            corePartial={corePartial}
            fileOrgPartial={fileOrgPartial}
          />
        </aside>
      </div>

      {/* 右键上下文菜单 */}
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isCollapsed={contextMenu.isCollapsed}
          isDir={contextMenu.isDir}
          onClose={() => setContextMenu(null)}
          onToggleCollapse={() => {
            console.log(
              "[CtxMenu] 右键菜单触发 toggleCollapse | path:",
              contextMenu.nodePath,
            );
            useAppStore.getState().toggleNodeCollapse(contextMenu.nodePath);
          }}
          onRefreshSubtree={() => {
            console.log(
              "[CtxMenu] 右键菜单触发 relayout | path:",
              contextMenu.nodePath,
            );
            handleRelayoutSubtree(contextMenu.nodePath);
          }}
        />
      )}

      {/* 隐藏文件对话框 */}
      {hiddenDialogPath && (
        <HiddenFilesDialog
          parentPath={hiddenDialogPath}
          onClose={() => setHiddenDialogPath(null)}
        />
      )}
    </div>
  );
}

export default App;
