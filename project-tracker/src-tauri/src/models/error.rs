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
// AppError — 结构化错误，通过 Tauri IPC 传给前端
// ============================================================

#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    /// 错误码（大写蛇形，如 IO_ERROR / AI_REQUEST_FAILED）
    pub code: String,
    /// 用户可见的友好提示
    pub message: String,
    /// 开发者技术详情（可选，不在 Toast 中默认显示）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

// ============================================================
// 快捷构造函数（按模块分类）
// ============================================================

impl AppError {
    // ---- 通用 ----
    pub fn io_error(detail: impl Into<String>) -> Self {
        Self {
            code: "IO_ERROR".into(),
            message: "文件读写失败，请检查磁盘空间和权限".into(),
            detail: Some(detail.into()),
        }
    }

    pub fn serialization(detail: impl Into<String>) -> Self {
        Self {
            code: "SERIALIZATION_ERROR".into(),
            message: "数据处理异常，请重试".into(),
            detail: Some(detail.into()),
        }
    }

    // ---- AI 相关 ----
    pub fn ai_request_failed(detail: impl Into<String>) -> Self {
        Self {
            code: "AI_REQUEST_FAILED".into(),
            message: "AI 服务请求失败，请检查网络连接".into(),
            detail: Some(detail.into()),
        }
    }

    pub fn ai_timeout() -> Self {
        Self {
            code: "AI_TIMEOUT".into(),
            message: "AI 服务连接超时，请检查网络设置或稍后重试".into(),
            detail: None,
        }
    }

    pub fn ai_invalid_key() -> Self {
        Self {
            code: "AI_INVALID_KEY".into(),
            message: "API Key 无效，请在设置页重新配置".into(),
            detail: None,
        }
    }

    pub fn ai_invalid_response(detail: impl Into<String>) -> Self {
        Self {
            code: "AI_INVALID_RESPONSE".into(),
            message: "AI 返回数据格式异常，可稍后重试".into(),
            detail: Some(detail.into()),
        }
    }

    pub fn ai_config_missing() -> Self {
        Self {
            code: "AI_CONFIG_MISSING".into(),
            message: "未配置 API Key，请在设置页填写后使用".into(),
            detail: None,
        }
    }

    // ---- 数据 ----
    pub fn data_save_failed(detail: impl Into<String>) -> Self {
        Self {
            code: "DATA_SAVE_FAILED".into(),
            message: "数据保存失败，请检查磁盘空间".into(),
            detail: Some(detail.into()),
        }
    }

    pub fn data_load_failed(detail: impl Into<String>) -> Self {
        Self {
            code: "DATA_LOAD_FAILED".into(),
            message: "数据加载失败，文件可能已损坏".into(),
            detail: Some(detail.into()),
        }
    }

    pub fn data_export_failed(detail: impl Into<String>) -> Self {
        Self {
            code: "DATA_EXPORT_FAILED".into(),
            message: "数据导出失败，请检查目标路径是否可写".into(),
            detail: Some(detail.into()),
        }
    }

    pub fn cache_clear_failed(detail: impl Into<String>) -> Self {
        Self {
            code: "CACHE_CLEAR_FAILED".into(),
            message: "缓存清理失败，可尝试手动删除".into(),
            detail: Some(detail.into()),
        }
    }

    // ---- 加密 ----
    pub fn encryption_failed(detail: impl Into<String>) -> Self {
        Self {
            code: "ENCRYPTION_FAILED".into(),
            message: "加密失败，请重试".into(),
            detail: Some(detail.into()),
        }
    }

    pub fn decryption_failed(detail: impl Into<String>) -> Self {
        Self {
            code: "DECRYPTION_FAILED".into(),
            message: "密钥不匹配或数据已损坏，请重新输入 API Key".into(),
            detail: Some(detail.into()),
        }
    }

    // ---- 目录 ----
    pub fn directory_scan_failed(detail: impl Into<String>) -> Self {
        Self {
            code: "DIRECTORY_SCAN_FAILED".into(),
            message: "目录扫描失败，请检查路径是否有效".into(),
            detail: Some(detail.into()),
        }
    }

    pub fn directory_not_found(path: impl Into<String>) -> Self {
        Self {
            code: "DIRECTORY_NOT_FOUND".into(),
            message: "目录不存在或已被移动，请重新添加".into(),
            detail: Some(path.into()),
        }
    }

    // ---- 系统 ----
    pub fn system_error(detail: impl Into<String>) -> Self {
        Self {
            code: "SYSTEM_ERROR".into(),
            message: "系统操作失败，请重试".into(),
            detail: Some(detail.into()),
        }
    }

    // ---- 通用兜底 ----
    pub fn generic(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            detail: None,
        }
    }
}

// ============================================================
// From 转换：让 ? 运算符可以直接从 String → AppError
// ============================================================

impl From<String> for AppError {
    fn from(s: String) -> Self {
        Self {
            code: "UNKNOWN".into(),
            message: s,
            detail: None,
        }
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        Self {
            code: "UNKNOWN".into(),
            message: s.to_string(),
            detail: None,
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}
