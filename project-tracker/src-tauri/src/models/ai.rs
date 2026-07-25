use serde::{Deserialize, Serialize};

// ============================================================
// SystemPromptData — prompts.json 的数据结构
// ============================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemPromptData {
    pub version: String,
    pub last_modified: String,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default)]
    pub analysis_prompt: String,
}

impl Default for SystemPromptData {
    fn default() -> Self {
        Self {
            version: "1.0".into(),
            last_modified: String::new(),
            system_prompt: String::new(),
            analysis_prompt: String::new(),
        }
    }
}

// ============================================================
// analyze_project — 请求（两次调用共用）
// ============================================================

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeRequest {
    /// 项目 ID
    pub project_id: String,
    /// 项目名称
    pub project_name: String,
    /// 项目根路径
    pub project_path: String,
    /// 项目状态
    pub status: String,
    /// 下一步工作
    pub next_steps: String,
    /// 备注
    pub notes: String,
    /// 目录树（JSON 序列化字符串）
    pub tree_json: String,
    /// 用户数据目录（空 = 使用系统默认），用于解析 Layer 2 prompt
    #[serde(default)]
    pub data_dir: String,
    /// API Key 覆盖（空 = 使用 .env）
    #[serde(default)]
    pub api_key: String,
    /// API 端点覆盖（空 = 使用 .env）
    #[serde(default)]
    pub api_endpoint: String,
    /// 模型覆盖（空 = 使用 .env）
    #[serde(default)]
    pub model: String,
}

/// 核心分析结果（概述 + 建议 + 洞察 + 风险）
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeCoreResponse {
    pub summary: String,
    pub suggested_next_steps: Vec<String>,
    pub structure_insights: Vec<String>,
    pub risks: Vec<String>,
}

/// 文件整理方案结果（树形文本）
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeFileOrgResponse {
    pub file_organization: String,
}

// ============================================================
// 兼容旧 AnalyzeResponse（前端聚合两次结果后使用）
// ============================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeResponse {
    pub summary: String,
    pub suggested_next_steps: Vec<String>,
    pub structure_insights: Vec<String>,
    pub risks: Vec<String>,
    #[serde(default)]
    pub file_organization: String,
}

// ============================================================
// test_ai_connection — 响应
// ============================================================

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionResult {
    pub ok: bool,
    pub message: String,
}

// ============================================================
// chat_with_ai — 请求 / 响应
// ============================================================

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    /// 项目 ID
    pub project_id: String,
    /// 项目名称
    pub project_name: String,
    /// 项目根路径
    pub project_path: String,
    /// 项目状态
    pub status: String,
    /// 下一步工作
    pub next_steps: String,
    /// 备注
    pub notes: String,
    /// 已过滤的目录树 JSON（不含隐藏节点，与思维导图显示一致）
    pub tree_json: String,
    /// 用户当前消息
    pub user_message: String,
    /// 对话历史（最近 N 轮），按时间升序
    #[serde(default)]
    pub history: Vec<ChatHistoryEntry>,
    /// 用户数据目录（空 = 使用系统默认），用于解析 Layer 2 prompt
    #[serde(default)]
    pub data_dir: String,
    /// API Key 覆盖（空 = 使用 .env）
    #[serde(default)]
    pub api_key: String,
    /// API 端点覆盖（空 = 使用 .env）
    #[serde(default)]
    pub api_endpoint: String,
    /// 模型覆盖（空 = 使用 .env）
    #[serde(default)]
    pub model: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatHistoryEntry {
    pub role: String, // "user" | "ai"
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    pub text: String,
    /// 使用的 prompt 层级：1=兜底, 2=全局系统, 3=项目级
    pub prompt_layer: u8,
}

// ============================================================
// SSE 流式事件 payload（通过 Tauri emit 发送给前端）
// ============================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamChunkPayload {
    pub project_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamDonePayload {
    pub project_id: String,
    pub prompt_layer: u8,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamErrorPayload {
    pub project_id: String,
    pub error: String,
}
