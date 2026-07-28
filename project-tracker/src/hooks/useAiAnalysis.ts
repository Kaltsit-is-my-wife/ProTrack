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

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/store/useAppStore";
import {
  analyzeProjectCore,
  analyzeProjectFileOrg,
  type AnalyzeCoreResponse,
} from "@/lib/ai";

interface UseAiAnalysisOptions {
  activeProjectId: string | null;
}

export function useAiAnalysis({ activeProjectId }: UseAiAnalysisOptions) {
  const setAiLoading = useAppStore((s) => s.setAiLoading);
  const setAiAnalysis = useAppStore((s) => s.setAiAnalysis);
  const aiLoading = useAppStore((s) => s.aiLoading);

  const [corePartial, setCorePartial] = useState<AnalyzeCoreResponse | null>(
    null,
  );
  const [fileOrgPartial, setFileOrgPartial] = useState<string | null>(null);
  const [analysisElapsed, setAnalysisElapsed] = useState(0);

  const analysisLoading = activeProjectId ? !!aiLoading[activeProjectId] : false;

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

      const [core, fileOrg] = await Promise.all([
        analyzeProjectCore(project, tree, dataDir).then((r) => {
          if (r) setCorePartial(r);
          return r;
        }),
        analyzeProjectFileOrg(project, tree, dataDir).then((r) => {
          if (r) setFileOrgPartial(r.fileOrganization);
          return r;
        }),
      ]);

      if (!core || !fileOrg) {
        toast.error("AI 服务请求失败，请检查网络连接", {
          description: "AI_REQUEST_FAILED",
          duration: 5000,
        });
        return;
      }

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
      toast.error("AI 服务请求失败，请检查网络连接", {
        description: "AI_REQUEST_FAILED",
        duration: 5000,
      });
    } finally {
      setAiLoading(activeProjectId, false);
    }
  }, [activeProjectId, setAiAnalysis, setAiLoading]);

  // AI 分析计时器
  useEffect(() => {
    if (!analysisLoading) {
      setAnalysisElapsed(0);
      return;
    }
    setAnalysisElapsed(0);
    const id = setInterval(() => {
      setAnalysisElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [analysisLoading]);

  return {
    handleAiAnalyze,
    corePartial,
    fileOrgPartial,
    analysisElapsed,
    analysisLoading,
  };
}
