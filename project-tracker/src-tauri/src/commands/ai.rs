use tauri::Emitter;

use crate::models::ai::{
    AnalyzeCoreResponse, AnalyzeFileOrgResponse, AnalyzeRequest, ChatRequest,
    StreamChunkPayload, StreamDonePayload, StreamErrorPayload, TestConnectionResult,
};
use crate::services;

// ============================================================
// save_system_prompt — 保存全局系统 prompt（Layer 2）
// ============================================================

#[tauri::command]
pub fn save_system_prompt(
    data_dir: String,
    prompt_text: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), String> {
    services::ai_client::save_system_prompt(&data_dir, &prompt_text, &logger_state)
}

// ============================================================
// load_system_prompt — 加载全局系统 prompt（Layer 2）
// ============================================================

#[tauri::command]
pub fn load_system_prompt(
    data_dir: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<Option<String>, String> {
    services::ai_client::load_system_prompt(&data_dir, &logger_state)
}

// ============================================================
// save_analysis_prompt — 保存全局分析 prompt（Layer 2）
// ============================================================

#[tauri::command]
pub fn save_analysis_prompt(
    data_dir: String,
    prompt_text: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), String> {
    services::ai_client::save_analysis_prompt(&data_dir, &prompt_text, &logger_state)
}

// ============================================================
// load_analysis_prompt — 加载全局分析 prompt（Layer 2）
// ============================================================

#[tauri::command]
pub fn load_analysis_prompt(
    data_dir: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<Option<String>, String> {
    services::ai_client::load_analysis_prompt(&data_dir, &logger_state)
}

// ============================================================
// save_project_rules — 保存项目规则（Layer 3）
// ============================================================

#[tauri::command]
pub fn save_project_rules(
    project_path: String,
    rules: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), String> {
    services::ai_client::save_project_rules(&project_path, &rules, &logger_state)
}

// ============================================================
// load_project_rules — 加载项目规则（Layer 3）
// ============================================================

#[tauri::command]
pub fn load_project_rules(
    project_path: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<Option<String>, String> {
    Ok(services::ai_client::load_project_rules(&project_path, &logger_state))
}

// ============================================================
// analyze_project_core — AI 核心分析（概述 + 建议 + 洞察 + 风险）
// ============================================================

#[tauri::command]
pub async fn analyze_project_core(
    req: AnalyzeRequest,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<AnalyzeCoreResponse, String> {
    services::ai_client::analyze_project_core(&req, &logger_state).await
}

// ============================================================
// analyze_project_file_org — AI 文件整理方案（树形文本）
// ============================================================

#[tauri::command]
pub async fn analyze_project_file_org(
    req: AnalyzeRequest,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<AnalyzeFileOrgResponse, String> {
    services::ai_client::analyze_project_file_org(&req, &logger_state).await
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
) -> Result<TestConnectionResult, String> {
    services::ai_client::test_connection(&api_key, &api_endpoint, &model, &logger_state).await
}

// ============================================================
// chat_with_ai — 流式 AI 对话
// ============================================================

#[tauri::command]
pub async fn chat_with_ai(
    req: ChatRequest,
    app_handle: tauri::AppHandle,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), String> {
    let project_id = req.project_id.clone();

    // 调用 service 层的流式聊天，所有 HTTP / SSE 逻辑在 service 中
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
            let _ = app_handle.emit(
                "chat-stream-error",
                StreamErrorPayload {
                    project_id: project_id.clone(),
                    error: err_msg.clone(),
                },
            );
            Err(err_msg)
        }
    }
}
