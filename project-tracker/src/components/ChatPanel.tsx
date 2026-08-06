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

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, ChevronLeft, ChevronRight, Copy, Ellipsis, Loader2, RefreshCw, Square, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore, type ChatMessage } from "@/store/useAppStore";
import { chatWithAiStream } from "@/lib/ai";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

// ============================================================
// 工具
// ============================================================

let msgUid = 0;
function nextId(): string {
  return "msg-" + Date.now().toString(36) + (msgUid++).toString(36);
}

// ============================================================
// ChatPanel — AI 对话面板（右下角小球 → 展开输入框动画）
// ============================================================

export function ChatPanel() {
  const [expanded, setExpanded] = useState(false);
  const [typing, setTyping] = useState(false); // 打字动画（首个 chunk 到达后关闭）
  const [busy, setBusy] = useState(false);
  const [chatError, setChatError] = useState(false); // 最新一次请求是否出错
  const [promptLayer, setPromptLayer] = useState<number | null>(null);
  const [layer1ReplyCount, setLayer1ReplyCount] = useState(0);
  const suppressWarning = useAppStore((s) => s.settings.suppressLayer1Warning);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef(false);
  const [dropdownMsgId, setDropdownMsgId] = useState<string | null>(null);
  // 分支管理：userMsgId → [aiMsgId, …]（所有版本按生成顺序），activeBranch[userMsgId] 当前活跃
  const [branchGroups, setBranchGroups] = useState<Record<string, string[]>>({});
  const [activeBranch, setActiveBranch] = useState<Record<string, string>>({});

  // ---- 从 store 读取当前项目状态 ----
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const project = useAppStore((s) => {
    if (!s.activeProjectId) return null;
    return s.projects.find((p) => p.id === s.activeProjectId) ?? null;
  });
  const tree = useAppStore((s) => {
    if (!s.activeProjectId) return null;
    return s.projectTrees[s.activeProjectId] ?? null;
  });
  const hiddenFiles = useAppStore((s) => s.hiddenFiles);
  const messages: ChatMessage[] = activeProjectId
    ? (useAppStore((s) => s.chatMessages[activeProjectId]) ?? [])
    : [];
  const addChatMessage = useAppStore((s) => s.addChatMessage);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  // 展开后自动聚焦
  useEffect(() => {
    if (expanded) {
      const timer = setTimeout(() => textareaRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [expanded]);

  // textarea 自适应高度
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  // 点击外部区域 → 收起
  useEffect(() => {
    if (!expanded) return;
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        if (textareaRef.current && textareaRef.current.value.trim()) return;
        setExpanded(false);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("pointerdown", handleClick);
    }, 200);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", handleClick);
    };
  }, [expanded]);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!dropdownMsgId) return;
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".chat-bubble-dropdown") && !t.closest(".chat-bubble-action-btn")) {
        setDropdownMsgId(null);
      }
    };
    const id = setTimeout(() => document.addEventListener("pointerdown", h), 100);
    return () => { clearTimeout(id); document.removeEventListener("pointerdown", h); };
  }, [dropdownMsgId]);

  // Escape 收起
  useEffect(() => {
    if (!expanded) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpanded(false);
        textareaRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [expanded]);

  // ---- 流式请求核心（targetId = 写入哪个消息，isNew = 是否新建用户消息+占位） ----
  const streamToTarget = useCallback(
    (text: string, targetId: string, isNew: boolean) => {
      if (!activeProjectId || !project || !tree) return;

      if (isNew) {
        addChatMessage(activeProjectId, { id: nextId(), text, role: "user", time: Date.now() });
        invoke("ensure_project_tracker_dir", { projectPath: project.path }).catch(() => {});
        addChatMessage(activeProjectId, { id: targetId, text: "", role: "ai", time: Date.now() });
      }

      setTyping(true);
      setBusy(true);
      stopRef.current = false;

      const all = useAppStore.getState().chatMessages[activeProjectId] ?? [];
      const history = isNew ? all.slice(0, -2).slice(-20) : all.slice(0, -1).slice(-20);
      let fullText = "";

      chatWithAiStream(project, tree, text, history, hiddenFiles,
        useAppStore.getState().settings.dataPath,
        (chunk: string) => {
          if (stopRef.current) return;
          if (!fullText) setTyping(false);
          fullText += chunk;
          const msgs = useAppStore.getState().chatMessages[activeProjectId] ?? [];
          useAppStore.setState({ chatMessages: { ...useAppStore.getState().chatMessages, [activeProjectId]: msgs.map(m => m.id === targetId ? { ...m, text: fullText } : m) } });
        },
        (layer: number) => {
          setTyping(false); setBusy(false); setChatError(false); setPromptLayer(layer);
          if (layer === 1) setLayer1ReplyCount(c => c + 1); else setLayer1ReplyCount(0);
        },
        (error: string) => {
          setTyping(false); setBusy(false); setChatError(true);
          const msgs = useAppStore.getState().chatMessages[activeProjectId] ?? [];
          useAppStore.setState({ chatMessages: { ...useAppStore.getState().chatMessages, [activeProjectId]: msgs.map(m => m.id === targetId ? { ...m, text: `抱歉，AI 请求失败：${error}` } : m) } });
        },
      );
    },
    [activeProjectId, project, tree, hiddenFiles, addChatMessage],
  );

  const doSend = useCallback(
    (text: string) => {
      if (!text || busy) return;
      setChatError(false);
      streamToTarget(text, nextId(), true);
    },
    [busy, streamToTarget],
  );

  const handleSend = useCallback(async () => {
    const value = textareaRef.current?.value.trim();
    if (!value) return;
    // 清空 + 重置高度
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "auto";
    }
    textareaRef.current?.focus();
    await doSend(value);
  }, [doSend]);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 降级方案
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  }, []);

  // ---- 分支导航（基于 branchGroups / activeBranch，不再 swap 文本）----
  const getBranchInfo = useCallback(
    (msg: ChatMessage, msgs: ChatMessage[]) => {
      if (msg.role !== "ai") return null;
      // 找到这条 AI 对应的用户消息 ID
      const idx = msgs.indexOf(msg);
      let userMsgId = "";
      for (let i = idx - 1; i >= 0; i--) {
        if (msgs[i]?.role === "user") { userMsgId = msgs[i].id; break; }
      }
      if (!userMsgId) return null;
      const branches = branchGroups[userMsgId];
      if (!branches || branches.length <= 1) return null;
      const cur = activeBranch[userMsgId] ?? branches[branches.length - 1];
      const curIdx = branches.indexOf(cur);
      return {
        userMsgId,
        branches,
        activeId: cur,
        activeIdx: curIdx,
        total: branches.length,
        isActive: msg.id === cur,
      };
    },
    [branchGroups, activeBranch],
  );

  const handleRegenerate = useCallback(
    (aiIndex: number) => {
      if (busy) return;
      const store = useAppStore.getState();
      const msgs = store.chatMessages[activeProjectId ?? ""] ?? [];
      const aiMsg = msgs[aiIndex];
      if (!aiMsg) return;

      let userMsgId = "";
      let userText = "";
      for (let i = aiIndex - 1; i >= 0; i--) {
        if (msgs[i]?.role === "user") { userText = msgs[i].text; userMsgId = msgs[i].id; break; }
      }
      if (!userText) return;

      // 新建 AI 消息（插入到原消息之后），流式写入
      const newAiId = nextId();
      const insertIdx = aiIndex + 1;
      useAppStore.setState({
        chatMessages: {
          ...store.chatMessages,
          [activeProjectId!]: [
            ...msgs.slice(0, insertIdx),
            { id: newAiId, text: "", role: "ai" as const, time: Date.now() },
            ...msgs.slice(insertIdx),
          ],
        },
      });

      // 注册分支（首次把当前消息也加进去）
      setBranchGroups(p => {
        const existing = p[userMsgId] ?? [];
        const all = existing.includes(aiMsg.id) ? existing : [aiMsg.id, ...existing];
        return { ...p, [userMsgId]: [...all, newAiId] };
      });
      setActiveBranch(p => ({ ...p, [userMsgId]: newAiId }));

      streamToTarget(userText, newAiId, false);
    },
    [activeProjectId, busy, streamToTarget],
  );

  const handleBranchNav = useCallback(
    (userMsgId: string, direction: -1 | 1) => {
      const branches = branchGroups[userMsgId];
      if (!branches || branches.length <= 1) return;
      const curId = activeBranch[userMsgId] ?? branches[branches.length - 1];
      const curIdx = branches.indexOf(curId);
      const newIdx = curIdx + direction;
      if (newIdx < 0 || newIdx >= branches.length) return;
      setActiveBranch(p => ({ ...p, [userMsgId]: branches[newIdx] }));
    },
    [branchGroups, activeBranch],
  );

  const handleStop = useCallback(() => {
    stopRef.current = true;
    setBusy(false);
    setTyping(false);
    setChatError(false);
  }, []);

  const handleBallClick = useCallback(() => {
    if (expanded) {
      if (busy) handleStop();
      else handleSend();
    } else {
      setExpanded(true);
    }
  }, [expanded, busy, handleSend, handleStop]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="chat-panel" ref={containerRef}>
      {/* 消息列表区 */}
      <div className="chat-messages">
        {promptLayer === 1 &&
          messages.length > 0 &&
          layer1ReplyCount >= 2 &&
          !suppressWarning && (
            <div className="chat-layer-warning">
              <span className="chat-layer-warning-text">
                当前使用内置兜底提示词，系统提示词未生效。 在项目目录{" "}
                <code>.project-tracker/prompt.json</code>{" "}
                中编写项目规则，或前往设置页配置全局系统 Prompt 来自定义。
              </span>
              <button
                type="button"
                className="chat-layer-warning-close"
                onClick={() => setLayer1ReplyCount(0)}
                title="关闭"
              >
                ×
              </button>
            </div>
          )}
        {messages.length === 0 ? (
          <p className="panel-placeholder" style={{ fontSize: 12 }}>
            输入消息开始 AI 对话
          </p>
        ) : (
          messages
            .filter((msg) => !(typing && msg.role === "ai" && !msg.text))
            .map((msg) => {
              const bi = getBranchInfo(msg, messages);
              // 非活跃分支 → 隐藏
              if (bi && !bi.isActive) return null;
              return (
              <div
                key={msg.id}
                className={`chat-bubble-row ${msg.role === "user" ? "is-user" : "is-ai"}`}
              >
                <div className="chat-bubble">
                  {msg.role === "ai" ? (
                    <MarkdownRenderer content={msg.text} />
                  ) : (
                    <span className="chat-bubble-text">{msg.text}</span>
                  )}
                  {msg.role === "ai" && msg.text && (
                    <div className="chat-bubble-actions">
                      <button
                        type="button"
                        className="chat-bubble-action-btn"
                        title="复制"
                        onClick={() => handleCopy(msg.text)}
                      >
                        <Copy className="size-3" />
                      </button>
                      <button
                        type="button"
                        className="chat-bubble-action-btn"
                        title="重新生成"
                        onClick={() => handleRegenerate(messages.indexOf(msg))}
                        disabled={busy}
                      >
                        <RefreshCw className="size-3" />
                      </button>
                      <button
                        type="button"
                        className="chat-bubble-action-btn"
                        title="更多"
                        onClick={(e) => { e.stopPropagation(); setDropdownMsgId(dropdownMsgId === msg.id ? null : msg.id); }}
                      >
                        <Ellipsis className="size-3" />
                      </button>
                      {dropdownMsgId === msg.id && bi && (
                        <div className="chat-bubble-dropdown">
                          <button type="button" className="chat-bubble-dropdown-item"
                            onClick={() => { handleBranchNav(bi.userMsgId, 1); setDropdownMsgId(null); }}
                            disabled={bi.activeIdx <= 0}>
                            <ChevronLeft className="size-3.5" />
                            <span>上一个回答</span>
                          </button>
                          <button type="button" className="chat-bubble-dropdown-item"
                            onClick={() => { handleBranchNav(bi.userMsgId, -1); setDropdownMsgId(null); }}
                            disabled={bi.activeIdx >= bi.total - 1}>
                            <ChevronRight className="size-3.5" />
                            <span>下一个回答</span>
                          </button>
                          <div className="chat-bubble-dropdown-sep" />
                          <span className="chat-bubble-dropdown-hint">{bi.activeIdx + 1}/{bi.total}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <span className="chat-bubble-time">
                  {new Date(msg.time).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )})
        )}
        {typing && (
          <div className="chat-bubble-row is-ai">
            <div className="chat-bubble chat-typing">
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 底部输入栏：小球 ↔ 展开动画 */}
      <div className={`chat-bar ${expanded ? "is-expanded" : "is-collapsed"}`}>
        <textarea
          ref={textareaRef}
          className="chat-bar-input"
          placeholder={chatError ? "AI 请求出错" : busy ? "AI 回复中…" : "输入消息…"}
          rows={1}
          disabled={busy}
          onKeyDown={handleKeyDown}
          onInput={autoResize}
        />
        <button
          type="button"
          className="chat-bar-ball"
          onClick={handleBallClick}
          title={expanded ? (chatError ? "出错" : typing ? "接收中…" : busy ? "发送中…" : "发送") : "展开输入框"}
        >
          {chatError ? <X className="size-4" />
          : typing ? <Loader2 className="size-4 animate-spin" />
          : busy ? <Square className="size-3.5" />
          : <ArrowUp className="size-4" />}
        </button>
      </div>
    </div>
  );
}
