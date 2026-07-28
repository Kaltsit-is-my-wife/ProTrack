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

import { useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import { useAppStore, useAiHistory } from "@/store/useAppStore";
import type {
  AnalyzeResponse,
  AnalyzeCoreResponse,
} from "@/lib/ai";

// ============================================================
// AiAnalysisContent — AI 分析标签页内容
// ============================================================
export function AiAnalysisContent({
  corePartial,
  fileOrgPartial,
  analysisElapsed,
}: {
  corePartial: AnalyzeCoreResponse | null;
  fileOrgPartial: string | null;
  analysisElapsed: number;
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
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              已耗时 {analysisElapsed}s / 150s
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
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              已耗时 {analysisElapsed}s / 150s
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
