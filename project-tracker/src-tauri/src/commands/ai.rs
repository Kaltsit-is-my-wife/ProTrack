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

use tauri::Emitter;

use crate::models::ai::{
    AnalyzeCoreResponse, AnalyzeFileOrgResponse, AnalyzeRequest, ChatRequest,
    StreamChunkPayload, StreamDonePayload, StreamErrorPayload, TestConnectionResult,
};
use crate::models::error::AppError;
use crate::services;

// ============================================================
// AI 错误分类 — 根据服务层返回的错误消息映射到精确的 AppError
// ============================================================

fn classify_ai_error(msg: String) -> AppError {
    if msg.contains("超时") {
        return AppError::ai_timeout();
    }
    if msg.contains("无法连接") {
        return AppError::ai_connection_failed(msg);
    }
    if msg.contains("认证失败") || msg.contains("API Key") || msg.contains("未配置 API Key") {
        return AppError::ai_invalid_key();
    }
    if msg.contains("HTTP 429") {
        return AppError::ai_rate_limited();
    }
    if msg.contains("HTTP 5") {
        if let Some(s) = msg.find("HTTP 5") {
            let rest = &msg[s + 5..];
            let code_str = rest.chars().take(3).filter(|c| c.is_ascii_digit()).collect::<String>();
            if let Ok(code) = code_str.parse::<u16>() {
                return AppError::ai_server_error(code);
            }
        }
        return AppError::ai_server_error(500);
    }
    if msg.contains("空内容") || msg.contains("不是有效 JSON") {
        return AppError::ai_invalid_response(msg);
    }
    AppError::ai_request_failed(msg)
}

// ============================================================
// save_system_prompt — 保存全局系统 prompt（Layer 2）
// ============================================================

#[tauri::command]
pub fn save_system_prompt(
    data_dir: String,
    prompt_text: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), AppError> {
    services::ai_client::save_system_prompt(&data_dir, &prompt_text, &logger_state)
        .map_err(|e| AppError::data_save_failed(e))
}

// ============================================================
// load_system_prompt — 加载全局系统 prompt（Layer 2）
// ============================================================

#[tauri::command]
pub fn load_system_prompt(
    data_dir: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<Option<String>, AppError> {
    services::ai_client::load_system_prompt(&data_dir, &logger_state)
        .map_err(|e| AppError::data_load_failed(e))
}

// ============================================================
// save_analysis_prompt — 保存全局分析 prompt（Layer 2）
// ============================================================

#[tauri::command]
pub fn save_analysis_prompt(
    data_dir: String,
    prompt_text: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), AppError> {
    services::ai_client::save_analysis_prompt(&data_dir, &prompt_text, &logger_state)
        .map_err(|e| AppError::data_save_failed(e))
}

// ============================================================
// load_analysis_prompt — 加载全局分析 prompt（Layer 2）
// ============================================================

#[tauri::command]
pub fn load_analysis_prompt(
    data_dir: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<Option<String>, AppError> {
    services::ai_client::load_analysis_prompt(&data_dir, &logger_state)
        .map_err(|e| AppError::data_load_failed(e))
}

// ============================================================
// save_project_rules — 保存项目规则（Layer 3）
// ============================================================

#[tauri::command]
pub fn save_project_rules(
    project_path: String,
    rules: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), AppError> {
    services::ai_client::save_project_rules(&project_path, &rules, &logger_state)
        .map_err(|e| AppError::data_save_failed(e))
}

// ============================================================
// load_project_rules — 加载项目规则（Layer 3）
// ============================================================

#[tauri::command]
pub fn load_project_rules(
    project_path: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<Option<String>, AppError> {
    Ok(services::ai_client::load_project_rules(&project_path, &logger_state))
}

// ============================================================
// analyze_project_core — AI 核心分析（概述 + 建议 + 洞察 + 风险）
// ============================================================

#[tauri::command]
pub async fn analyze_project_core(
    req: AnalyzeRequest,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<AnalyzeCoreResponse, AppError> {
    services::ai_client::analyze_project_core(&req, &logger_state)
        .await
        .map_err(classify_ai_error)
}

// ============================================================
// analyze_project_file_org — AI 文件整理方案（树形文本）
// ============================================================

#[tauri::command]
pub async fn analyze_project_file_org(
    req: AnalyzeRequest,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<AnalyzeFileOrgResponse, AppError> {
    services::ai_client::analyze_project_file_org(&req, &logger_state)
        .await
        .map_err(classify_ai_error)
}

// ============================================================
// test_ai_connection
// ============================================================

#[tauri::command]
pub async fn test_ai_connection(
    api_key: String,
    api_endpoint: String,
    model: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<TestConnectionResult, AppError> {
    services::ai_client::test_connection(&api_key, &api_endpoint, &model, &logger_state)
        .await
        .map_err(classify_ai_error)
}

// ============================================================
// chat_with_ai — 流式 AI 对话
// ============================================================

#[tauri::command]
pub async fn chat_with_ai(
    req: ChatRequest,
    app_handle: tauri::AppHandle,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), AppError> {
    let project_id = req.project_id.clone();

    let result = services::ai_client::chat_stream(&req, &logger_state, |chunk| {
        let _ = app_handle.emit(
            "chat-stream-chunk",
            StreamChunkPayload {
                project_id: project_id.clone(),
                text: chunk.to_string(),
            },
        );
    })
    .await;

    match result {
        Ok(prompt_layer) => {
            let _ = app_handle.emit(
                "chat-stream-done",
                StreamDonePayload {
                    project_id: project_id.clone(),
                    prompt_layer,
                },
            );
            Ok(())
        }
        Err(err_msg) => {
            let app_err = classify_ai_error(err_msg.clone());
            let _ = app_handle.emit(
                "chat-stream-error",
                StreamErrorPayload {
                    project_id: project_id.clone(),
                    error: err_msg,
                },
            );
            Err(app_err)
        }
    }
}
