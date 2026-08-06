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
  Trash2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
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
import { useAppStore } from "@/store/useAppStore";
import { usePanelResize } from "@/hooks/usePanelResize";
import { useTheme } from "@/hooks/useTheme";
import { useAiAnalysis } from "@/hooks/useAiAnalysis";
import { useDirectoryRefresh } from "@/hooks/useDirectoryRefresh";
import { useMindMapLayout } from "@/hooks/useMindMapLayout";
import { useNodeActions } from "@/hooks/useNodeActions";
import type { MindMapNodeData } from "@/lib/layoutMindMap";
import { SettingsPage } from "@/components/SettingsPage";
import { HiddenFilesDialog } from "@/components/HiddenFilesDialog";
import { IgnoreRulesDialog } from "@/components/IgnoreRulesDialog";
import { NodeContextMenu } from "@/components/NodeContextMenu";
import { ProjectContextMenu } from "@/components/ProjectContextMenu";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MindMapNode, HiddenMarkerNode } from "@/components/MindMapNode";
import { DetailPanel } from "@/components/DetailPanel";

import { DEPTH_OPTIONS, PANEL_LEFT_DEFAULT_WIDTH, PANEL_RIGHT_DEFAULT_WIDTH } from "@/lib/constants";

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

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
  const projectTrees = useAppStore((s) => s.projectTrees);
  const collapsedPaths = useAppStore((s) => s.collapsedPaths);
  const setHiddenFiles = useAppStore((s) => s.setHiddenFiles);
  const removeProject = useAppStore((s) => s.removeProject);
  const hiddenFiles = useAppStore((s) => s.hiddenFiles);
  const staleProjects = useAppStore((s) => s.staleProjects);
  const nodeSpacing = useAppStore((s) => s.settings.nodeSpacing);

  // 隐藏文件对话框
  const [hiddenDialogPath, setHiddenDialogPath] = useState<string | null>(null);

  // 排除规则（项目级 .project-tracker/ignore）
  const [ignoreRulesByProject, setIgnoreRulesByProject] = useState<
    Record<string, string[]>
  >({});
  const [ignoreDialogProjectId, setIgnoreDialogProjectId] = useState<
    string | null
  >(null);

  // ---- 右键上下文菜单（思维导图节点）----
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    nodePath: string;
    isCollapsed: boolean;
    isDir: boolean;
  } | null>(null);

  // ---- 右键上下文菜单（项目列表）----
  const [projectContextMenu, setProjectContextMenu] = useState<{
    x: number;
    y: number;
    projectId: string;
    projectName: string;
  } | null>(null);

  // ---- 面板宽度 ----
  const leftPanel = usePanelResize({
    initialWidth: PANEL_LEFT_DEFAULT_WIDTH,
    minWidth: 180,
    maxWidth: 500,
    direction: 1,
  });
  const rightPanel = usePanelResize({
    initialWidth: PANEL_RIGHT_DEFAULT_WIDTH,
    minWidth: 220,
    maxWidth: 600,
    direction: -1,
  });

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

  // 获取当前项目的排除规则
  const currentIgnoreRules: string[] = activeProjectId
    ? (ignoreRulesByProject[activeProjectId] ?? [])
    : [];
  // ref 版：回调不走 deps 也能读到最新值
  const currentIgnoreRulesRef = useRef(currentIgnoreRules);
  currentIgnoreRulesRef.current = currentIgnoreRules;

  // ---- 自定义 Hooks ----

  // AI 分析
  const {
    handleAiAnalyze,
    corePartial,
    fileOrgPartial,
    analysisElapsed,
    analysisLoading,
  } = useAiAnalysis({ activeProjectId });

  // 目录刷新 / 项目添加 / 项目选择
  const {
    handleRefresh,
    handleAddProject,
    handleSelectProject,
    refreshing,
    forceRelayoutRef,
  } = useDirectoryRefresh({ activeProjectId, currentIgnoreRulesRef });

  // 节点操作（删除、选择、双击）
  const {
    handleNodesDelete,
    handleDeleteSelected,
    handleNodeDoubleClick,
    selectedNodes,
    handleSelectionChange,
  } = useNodeActions({
    hiddenFiles,
    setHiddenFiles,
    setNodes,
    setEdges,
    onOpenHiddenDialog: setHiddenDialogPath,
  });

  // 思维导图布局
  const {
    saveCurrentSnapshot,
    handleRelayoutSubtree,
    handleExcludeDir,
    handleSaveIgnoreRules,
    checkProjectStale,
  } = useMindMapLayout({
    activeProjectId,
    projectTrees,
    maxDepth,
    hiddenFiles,
    nodeSpacing,
    collapsedPaths,
    setNodes,
    setEdges,
    nodesRef,
    edgesRef,
    currentIgnoreRulesRef,
    ignoreRulesByProject,
    setIgnoreRulesByProject,
    forceRelayoutRef,
    handleRefresh,
  });

  // ---- 加载项目排除规则 ----
  useEffect(() => {
    if (!activeProjectId) return;
    const project = useAppStore
      .getState()
      .projects.find((p) => p.id === activeProjectId);
    if (!project) return;
    invoke<string[]>("load_ignore_rules", { projectPath: project.path })
      .then((rules) => {
        setIgnoreRulesByProject((prev) => ({
          ...prev,
          [activeProjectId]: rules,
        }));
      })
      .catch(() => {});
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
        clearCollapsed();
      }
    },
    [setMaxDepth, clearCollapsed, activeProjectId],
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
            disabled={!activeProjectId || analysisLoading}
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
              className={`size-3.5 ${analysisLoading ? "animate-spin" : ""}`}
            />
            {analysisLoading ? "分析中" : "AI 分析"}
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
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setProjectContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              projectId: p.id,
                              projectName: p.name,
                            });
                          }}
                          title="右键查看更多操作"
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
            analysisElapsed={analysisElapsed}
          />
        </aside>
      </div>

      {/* 右键上下文菜单（项目列表）*/}
      {projectContextMenu && (
        <ProjectContextMenu
          x={projectContextMenu.x}
          y={projectContextMenu.y}
          projectName={projectContextMenu.projectName}
          onClose={() => setProjectContextMenu(null)}
          onRemove={() => {
            console.log(
              "[Project] 右键移除 | id:",
              projectContextMenu.projectId,
              "| name:",
              projectContextMenu.projectName,
            );
            removeProject(projectContextMenu.projectId);
          }}
          onEditIgnore={() => {
            setIgnoreDialogProjectId(projectContextMenu.projectId);
          }}
        />
      )}

      {/* 右键上下文菜单（思维导图节点）*/}
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
          onExcludeDir={() => {
            const nodePath = contextMenu.nodePath;
            const dirName = nodePath.split(/[\\/]/).pop() || nodePath;
            handleExcludeDir(dirName);
          }}
          onHideFile={() => {
            const target = nodesRef.current.find(
              (n) => n.id === contextMenu.nodeId,
            );
            if (target) handleNodesDelete([target]);
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

      {/* 排除规则编辑对话框 */}
      {ignoreDialogProjectId &&
        (() => {
          const p = projects.find((pp) => pp.id === ignoreDialogProjectId);
          if (!p) return null;
          const rules = ignoreRulesByProject[ignoreDialogProjectId] ?? [];
          return (
            <IgnoreRulesDialog
              projectName={p.name}
              initialRules={rules.join("\n")}
              onSave={(text) => handleSaveIgnoreRules(p.path, text)}
              onClose={() => setIgnoreDialogProjectId(null)}
            />
          );
        })()}
    </div>
  );
}

export default App;
