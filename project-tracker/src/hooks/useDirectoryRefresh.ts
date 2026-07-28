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

import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/store/useAppStore";
import type { DirNode } from "@/types/directory";
import { getDirName } from "@/types/directory";
import { filterChildren } from "@/lib/filterRules";

interface UseDirectoryRefreshOptions {
  activeProjectId: string | null;
  currentIgnoreRulesRef: React.MutableRefObject<string[]>;
}

export function useDirectoryRefresh({
  activeProjectId,
  currentIgnoreRulesRef,
}: UseDirectoryRefreshOptions) {
  const addProject = useAppStore((s) => s.addProject);
  const setProjectTree = useAppStore((s) => s.setProjectTree);
  const setActiveProject = useAppStore((s) => s.setActiveProject);
  const setHiddenFiles = useAppStore((s) => s.setHiddenFiles);

  const [refreshing, setRefreshing] = useState(false);
  const forceRelayoutRef = useRef(false);

  const handleRefresh = useCallback(async () => {
    forceRelayoutRef.current = true;
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
        ignoreRules: currentIgnoreRulesRef.current,
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
  }, [activeProjectId, currentIgnoreRulesRef]);

  const handleAddProject = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择要追踪的项目目录",
      });

      if (!selected) {
        console.log("[Project] 用户取消添加");
        return;
      }

      const dirPath = selected as string;
      const name = getDirName(dirPath);

      const scanDepth = 5;
      const tree = await invoke<DirNode>("scan_directory", {
        path: dirPath,
        maxDepth: scanDepth,
        ignoreRules: currentIgnoreRulesRef.current,
      });

      addProject({
        name,
        path: dirPath,
        status: "not-started",
        nextSteps: "",
        notes: "",
      });

      const all = useAppStore.getState().projects;
      const latest = all[all.length - 1];

      if (latest) {
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

        setProjectTree(latest.id, tree);
        setActiveProject(latest.id);
        invoke("ensure_project_tracker_dir", { projectPath: dirPath }).catch(
          () => {},
        );
        console.log(
          "[Project] 已添加 | id:",
          latest.id,
          "| name:",
          name,
          "| path:",
          dirPath,
        );
      } else {
        console.error("[Project] 添加失败：无法获取最新项目 | all:", all);
      }
    } catch (err) {
      console.error("[Project] 添加项目失败:", err);
    }
  }, [addProject, setProjectTree, setActiveProject, setHiddenFiles, currentIgnoreRulesRef]);

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

  return {
    handleRefresh,
    handleAddProject,
    handleSelectProject,
    refreshing,
    forceRelayoutRef,
  };
}
