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
