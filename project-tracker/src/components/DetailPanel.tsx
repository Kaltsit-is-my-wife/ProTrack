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

import { useState, useEffect } from "react";
import { ChevronDown, Pen } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore, useActiveProject } from "@/store/useAppStore";
import type { ProjectStatus } from "@/types/project";
import { PROJECT_STATUS_LABELS } from "@/types/project";
import { useVerticalResize } from "@/hooks/useVerticalResize";
import type { AnalyzeCoreResponse } from "@/lib/ai";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RulesEditDialog } from "@/components/RulesEditDialog";
import { AiAnalysisContent } from "@/components/AiAnalysisContent";
import { ChatPanel } from "@/components/ChatPanel";

// ============================================================
// DetailPanel — 右侧面板（标签页：项目详情 | AI 分析）
// ============================================================
export function DetailPanel({
  corePartial,
  fileOrgPartial,
  analysisElapsed,
}: {
  corePartial: AnalyzeCoreResponse | null;
  fileOrgPartial: string | null;
  analysisElapsed: number;
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
                analysisElapsed={analysisElapsed}
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
