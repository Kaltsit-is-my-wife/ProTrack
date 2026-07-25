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

use serde::Serialize;

// ============================================================
// DirNode — 返回给前端的树形节点
// ============================================================

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DirNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    /// 文件最后修改时间（毫秒时间戳），目录为 None
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<u64>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<DirNode>,
}

// ============================================================
// LogEntry — 前端日志写入
// ============================================================

#[derive(Debug, serde::Deserialize)]
pub struct LogEntry {
    pub level: String,  // "debug" | "info" | "warn" | "error"
    pub source: String, // 日志来源，如 "App.tsx", "React", "IPC"
    pub message: String,
}
