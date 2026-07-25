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

import { Component, type ReactNode } from "react";

// ============================================================
// ErrorBoundary — 捕获子组件渲染错误，防止整个应用白屏
//
// React 目前未提供 Hook 版本的 ErrorBoundary，必须使用 Class Component。
// 包裹在容易出错的独立渲染区域（AI 分析面板、思维导图、对话框等）。
// ============================================================

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** 自定义降级 UI，若不提供则使用默认样式 */
  fallback?: ReactNode;
  /** 标识区域名称，用于 console 日志 */
  name?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const tag = this.props.name ?? "unknown";
    console.error(`[ErrorBoundary:${tag}]`, error);
    console.error(`[ErrorBoundary:${tag}] componentStack:`, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
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
          <p className="error-boundary-text">该区域加载失败</p>
          {this.props.name && (
            <p className="error-boundary-hint">[{this.props.name}]</p>
          )}
          <button
            type="button"
            className="error-boundary-retry-btn"
            onClick={this.handleRetry}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
