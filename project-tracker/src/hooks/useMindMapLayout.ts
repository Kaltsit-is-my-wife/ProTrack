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

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Node, Edge } from "reactflow";
import { useAppStore } from "@/store/useAppStore";
import type { DirNode } from "@/types/directory";
import { layoutMindMap, type MindMapNodeData } from "@/lib/layoutMindMap";
import { buildFingerprint } from "@/lib/fingerprint";
import { logger } from "@/lib/logger";

interface UseMindMapLayoutOptions {
  activeProjectId: string | null;
  projectTrees: Record<string, DirNode>;
  maxDepth: number;
  hiddenFiles: Record<string, string[]>;
  nodeSpacing: number;
  collapsedPaths: string[];
  setNodes: React.Dispatch<React.SetStateAction<Node<MindMapNodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  nodesRef: React.MutableRefObject<Node<MindMapNodeData>[]>;
  edgesRef: React.MutableRefObject<Edge[]>;
  currentIgnoreRulesRef: React.MutableRefObject<string[]>;
  ignoreRulesByProject: Record<string, string[]>;
  setIgnoreRulesByProject: React.Dispatch<
    React.SetStateAction<Record<string, string[]>>
  >;
  forceRelayoutRef: React.MutableRefObject<boolean>;
  handleRefresh: () => Promise<void>;
}

export function useMindMapLayout({
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
}: UseMindMapLayoutOptions) {
  // 子树重排：存储要重排布局的节点路径
  const subtreeRelayoutPathRef = useRef<string | null>(null);
  // 布局版本号（子树重排时递增以触发 layout effect）
  const [layoutVersion, setLayoutVersion] = useState(0);
  // 布局锁：防止并发布局竞态覆盖
  const layoutLock = useRef(0);
  // 布局 effect 专用的"上一次项目"追踪
  const lastLayoutProjectRef = useRef<string | null>(null);
  // 标记"快照恢复触发的重跑"，跳过以避免误清除快照或 ELK 覆盖
  const isRestoringRef = useRef(false);
  // 防止异步指纹扫描竞态
  const fingerprintSeqRef = useRef(0);
  // 前一个活动项目（用于快照保存 + 检测项目切换）
  const prevActiveRef = useRef<string | null>(null);

  // ==========================================================
  // 工具：保存当前项目快照（同步节点 + 异步指纹）
  // ==========================================================

  const saveCurrentSnapshot = useCallback(
    (projectId: string) => {
      const store = useAppStore.getState();
      const tree = store.projectTrees[projectId];
      const ns = nodesRef.current;
      const es = edgesRef.current;
      if (!tree) {
        logger.info("Snapshot",
          "saveCurrentSnapshot: 跳过，无 tree, projectId:",
          projectId,
        );
        return;
      }
      if (ns.length === 0) {
        logger.info("Snapshot",
          "saveCurrentSnapshot: 跳过，nodes 为空, projectId:",
          projectId,
        );
        return;
      }

      // 保留已有指纹（指纹只在 ELK 初次生成时写入，不在离开时覆盖）
      const existingFp = store.projectSnapshots[projectId]?.dirFingerprint;

      logger.info("Snapshot",
        "保存快照（保留已有指纹）, projectId:",
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
    },
    [nodesRef, edgesRef],
  );

  // ==========================================================
  // 工具：异步扫描目录，将指纹写入快照（ELK 完成后调用）
  // ==========================================================

  const updateSnapshotFingerprint = useCallback(
    (projectId: string) => {
      const store = useAppStore.getState();
      const tree = store.projectTrees[projectId];
      if (!tree) return;

      const seq = ++fingerprintSeqRef.current;
      logger.info("Fingerprint",
        "开始异步扫描, seq:",
        seq,
        "path:",
        tree.path,
      );
      invoke<DirNode>("scan_directory", {
        path: tree.path,
        maxDepth: 5,
        ignoreRules: currentIgnoreRulesRef.current,
      })
        .then((freshTree) => {
          if (seq !== fingerprintSeqRef.current) {
            logger.info("Fingerprint", "扫描结果被丢弃（竞态）, seq:", seq);
            return;
          }
          const fp = buildFingerprint(freshTree);
          logger.info("Fingerprint",
            "扫描完成, seq:",
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
            logger.info("Fingerprint",
              "指纹已写入快照, projectId:",
              projectId,
            );
          }
        })
        .catch((err) => logger.error("Fingerprint", "扫描失败:", err));
    },
    [currentIgnoreRulesRef],
  );

  // ==========================================================
  // 工具：后台扫描目录，比对指纹，标记 stale
  // ==========================================================

  const checkProjectStale = useCallback(
    (projectId: string) => {
      const store = useAppStore.getState();
      const snap = store.projectSnapshots[projectId];
      if (!snap) {
        logger.info("StaleCheck", "跳过：无快照, projectId:", projectId);
        return;
      }
      if (!snap.dirFingerprint) {
        logger.info("StaleCheck",
          "跳过：快照无指纹, projectId:",
          projectId,
          "snapKeys:",
          Object.keys(snap),
        );
        return;
      }
      const tree = store.projectTrees[projectId];
      if (!tree) {
        logger.info("StaleCheck", "跳过：无目录树, projectId:", projectId);
        return;
      }

      logger.info("StaleCheck",
        "开始后台扫描, projectId:",
        projectId,
        "path:",
        tree.path,
        "已存指纹长度:",
        snap.dirFingerprint.length,
      );
      invoke<DirNode>("scan_directory", {
        path: tree.path,
        maxDepth: 5,
        ignoreRules: currentIgnoreRulesRef.current,
      })
        .then((freshTree) => {
          const fp = buildFingerprint(freshTree);
          const oldCount = JSON.parse(snap.dirFingerprint!).length;
          const newCount = JSON.parse(fp).length;
          const changed = fp !== snap.dirFingerprint;
          logger.info("StaleCheck",
            "扫描完成, 旧文件数:",
            oldCount,
            "新文件数:",
            newCount,
            "有变更:",
            changed,
          );
          if (changed) {
            useAppStore.getState().markProjectStale(projectId);
            logger.info("StaleCheck",
              "✅ 已标记 stale, projectId:",
              projectId,
            );
          } else {
            useAppStore.getState().clearProjectStale(projectId);
            logger.info("StaleCheck",
              "指纹一致，清除 stale, projectId:",
              projectId,
            );
          }
        })
        .catch((err) => logger.error("StaleCheck", "扫描失败:", err));
    },
    [currentIgnoreRulesRef],
  );

  // ---- 排除规则 ----

  const handleExcludeDir = useCallback(
    async (dirName: string) => {
      if (!activeProjectId) return;
      const project = useAppStore
        .getState()
        .projects.find((p) => p.id === activeProjectId);
      if (!project) return;

      const rules = ignoreRulesByProject[activeProjectId] ?? [];
      const newRule = dirName + "/";
      if (rules.includes(newRule)) return;

      const updated = [...rules, newRule];
      currentIgnoreRulesRef.current = updated;
      setIgnoreRulesByProject((prev) => ({
        ...prev,
        [activeProjectId]: updated,
      }));

      await invoke("save_ignore_rules", {
        projectPath: project.path,
        rules: updated,
      }).catch(() => {});
      handleRefresh();
    },
    [
      activeProjectId,
      ignoreRulesByProject,
      currentIgnoreRulesRef,
      setIgnoreRulesByProject,
      handleRefresh,
    ],
  );

  const handleSaveIgnoreRules = useCallback(
    async (projectPath: string, text: string) => {
      const rules = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (activeProjectId) {
        currentIgnoreRulesRef.current = rules;
        setIgnoreRulesByProject((prev) => ({
          ...prev,
          [activeProjectId]: rules,
        }));
      }

      await invoke("save_ignore_rules", { projectPath, rules }).catch(
        () => {},
      );
      handleRefresh();
    },
    [activeProjectId, currentIgnoreRulesRef, setIgnoreRulesByProject, handleRefresh],
  );

  // 子树重排：触发 ELK 重排，但只更新选中节点子树的布局
  const handleRelayoutSubtree = useCallback(
    (nodePath: string) => {
      logger.info("Layout", "子树重排:", nodePath);
      if (activeProjectId) {
        useAppStore.getState().clearProjectSnapshot(activeProjectId);
      }
      subtreeRelayoutPathRef.current = nodePath;
      setLayoutVersion((v) => v + 1);
    },
    [activeProjectId],
  );

  // ==========================================================
  // 窗口关闭前保存当前项目快照
  // ==========================================================

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeProjectId) {
        saveCurrentSnapshot(activeProjectId);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeProjectId, saveCurrentSnapshot]);

  // ==========================================================
  // 离开项目 → 保存快照
  // ==========================================================

  useEffect(() => {
    const prev = prevActiveRef.current;
    if (prev && prev !== activeProjectId) {
      logger.info("Layout", "离开项目, prev:", prev, "new:", activeProjectId);
      saveCurrentSnapshot(prev);
    } else {
      logger.info("Layout",
        "初始进入或同项目切换, prev:",
        prev,
        "new:",
        activeProjectId,
      );
    }
    prevActiveRef.current = activeProjectId;
  }, [activeProjectId, saveCurrentSnapshot]);

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
      logger.info("Layout",
        "项目切换检测, activeProjectId:",
        activeProjectId,
        "hasSnap:",
        !!snap,
        "snapKeys:",
        snap ? Object.keys(snap) : "N/A",
      );
      if (snap && snap.treeRootPath === tree.path) {
        logger.info("Layout",
          "恢复快照, nodes:",
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
        logger.info("Layout", "触发异步变更检测...");
        checkProjectStale(activeProjectId);

        return;
      }
      // 快照无效（目录可能变更了），清除残留
      if (snap) {
        logger.info("Layout",
          "快照 treeRootPath 不匹配，清除, snapPath:",
          snap.treeRootPath,
          "treePath:",
          tree.path,
        );
        useAppStore.getState().clearProjectSnapshot(activeProjectId);
      }
      // 无快照的新项目：重置 collapsedPaths（可能残留上一个项目的值）
      logger.info("Layout", "无有效快照，重置 collapsedPaths，运行 ELK");
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
    const elkProjectId = activeProjectId;

    const latestHidden = useAppStore.getState().hiddenFiles;

    logger.info("Layout",
      "ELK 布局开始 | lock:",
      lock,
      "| maxDepth:",
      maxDepth,
    );
    layoutMindMap(tree, {
      maxDepth,
      hiddenFiles: latestHidden,
      nodeSpacing,
    })
      .then(({ nodes: newNodes, edges: newEdges }) => {
        if (cancelled || lock !== layoutLock.current) {
          logger.info("Layout",
            "ELK 结果过期 | lock:",
            lock,
            "| current:",
            layoutLock.current,
          );
          forceRelayoutRef.current = false;
          return;
        }
        logger.info("Layout",
          "ELK 布局完成 | nodes:",
          newNodes.length,
          "edges:",
          newEdges.length,
        );

        // 位置保留：已存在的节点保持当前位置 + hidden 状态
        const currentNodes = nodesRef.current;
        const existingMap = new Map(
          currentNodes.map((n: Node) => [n.id, n]),
        );
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
                node.position.x.toFixed(0) +
                "," +
                node.position.y.toFixed(0);
              existingMap.delete(id);
              clearedCount++;
            }
          }
          logger.info("Layout",
            "path:",
            relayoutPath,
            "| cleared children:",
            clearedCount,
          );
        }

        const finalNodes = newNodes.map((nn) => {
          const cur = existingMap.get(nn.id);
          if (cur && !forceRelayoutRef.current)
            return { ...nn, position: cur.position, hidden: cur.hidden };

          const parentEdge = newEdges.find((e) => e.target === nn.id);
          if (parentEdge) {
            const parentCur = existingMap.get(parentEdge.source);
            const parentNew = newMap.get(parentEdge.source);
            if (parentCur && parentNew) {
              const dx = parentCur.position.x - parentNew.position.x;
              const dy = parentCur.position.y - parentNew.position.y;
              const finalPos = {
                x: nn.position.x + dx,
                y: nn.position.y + dy,
              };
              if (relayoutPath && nn.id.startsWith(relayoutPath)) {
                const old = oldPositions[nn.id] ?? "NEW";
                logger.info("Layout",
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
            logger.info("Layout",
              "FALLBACK:",
              nn.id.split("\\").pop(),
              "| pos:",
              nn.position.x.toFixed(0) + "," + nn.position.y.toFixed(0),
            );
          }
          return nn;
        });

        setNodes(finalNodes);
        setEdges(newEdges);
        forceRelayoutRef.current = false;

        // ELK 完成后：确保快照存在 → 补指纹
        if (elkProjectId) {
          const snapStore = useAppStore.getState();
          const hasSnap = !!snapStore.projectSnapshots[elkProjectId];
          logger.info("Layout",
            "ELK 完成, projectId:",
            elkProjectId,
            "已有快照:",
            hasSnap,
          );
          if (!hasSnap) {
            logger.info("Layout",
              "首次创建快照, nodes:",
              newNodes.length,
            );
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
        forceRelayoutRef.current = false;
        logger.error("Layout", "ELK 布局失败:", err);
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
    checkProjectStale,
    updateSnapshotFingerprint,
    nodesRef,
    forceRelayoutRef,
  ]);

  // ==========================================================
  // 折叠/展开：切换节点 hidden 状态（不触发 ELK）
  // ==========================================================

  useEffect(() => {
    if (!activeProjectId) return;
    logger.info("Collapse",
      "visibility toggle, collapsed:",
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
      if (changed) logger.info("Collapse", "updated node visibility");
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

  return {
    saveCurrentSnapshot,
    handleRelayoutSubtree,
    handleExcludeDir,
    handleSaveIgnoreRules,
    checkProjectStale,
  };
}
