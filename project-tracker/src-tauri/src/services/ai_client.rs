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

use futures_util::StreamExt;
use std::path::PathBuf;

use crate::models::ai::{
    AnalyzeCoreResponse, AnalyzeFileOrgResponse, AnalyzeRequest, ChatRequest,
    TestConnectionResult,
};
use crate::utils::logger::{Level, Logger};
use crate::services::prompt_manager;

// ============================================================
// 超时常量（遵循 docs/13-constant-principle.md）
// ============================================================

/// 连接测试超时 (s)
const TEST_CONNECTION_TIMEOUT_SECS: u64 = 15;
/// 流式聊天超时 (s)
const CHAT_STREAM_TIMEOUT_SECS: u64 = 120;
/// 分析请求超时 (s)
const ANALYSIS_TIMEOUT_SECS: u64 = 150;

// ============================================================
// 内部类型 — HTTP API 通信（不对外暴露）
// ============================================================

#[derive(Debug, serde::Deserialize)]
struct ApiChatCompletionResponse {
    choices: Option<Vec<ApiChoice>>,
    #[allow(dead_code)]
    error: Option<ApiErrorBody>,
}

#[derive(Debug, serde::Deserialize)]
struct ApiChoice {
    message: Option<ApiChoiceMessage>,
}

#[derive(Debug, serde::Deserialize)]
struct ApiChoiceMessage {
    content: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct ApiErrorBody {
    #[allow(dead_code)]
    message: String,
}

// ============================================================
// AI 配置（环境变量 + 设置覆盖）
// ============================================================

struct AiConfig {
    api_key: String,
    endpoint: String,
    model: String,
    is_anthropic_native: bool,
}

/// 规范化端点 URL
fn normalize_endpoint(raw: &str) -> (String, bool) {
    let is_anthropic = raw.contains("anthropic.com") && raw.ends_with("/v1/messages");
    let endpoint = if is_anthropic || raw.ends_with("/chat/completions") {
        raw.to_string()
    } else {
        format!("{}/chat/completions", raw.trim_end_matches('/'))
    };
    (endpoint, is_anthropic)
}

impl AiConfig {
    /// 从 .env 读取默认值，传入的设置值非空时覆盖
    fn from_env_with(api_key: &str, endpoint: &str, model: &str) -> Self {
        // 环境变量兜底
        let env_key = std::env::var("AI_API_KEY").unwrap_or_default();
        let env_endpoint = std::env::var("AI_API_ENDPOINT")
            .unwrap_or_else(|_| "https://api.openai.com/v1/chat/completions".into());
        let env_model = std::env::var("AI_MODEL").unwrap_or_else(|_| "gpt-4o".into());

        // 设置值优先，空则走环境变量
        let final_key = if api_key.is_empty() { &env_key } else { api_key };
        let final_endpoint = if endpoint.is_empty() { &env_endpoint } else { endpoint };
        let final_model = if model.is_empty() { &env_model } else { model };

        let (normalized_endpoint, is_anthropic) = normalize_endpoint(final_endpoint);

        AiConfig {
            api_key: final_key.to_string(),
            endpoint: normalized_endpoint,
            model: final_model.to_string(),
            is_anthropic_native: is_anthropic,
        }
    }
}

// ============================================================
// 辅助 — 查找项目根目录
// ============================================================

pub fn find_project_root() -> Option<PathBuf> {
    let cwd = std::env::current_dir().ok()?;

    if cwd.join("package.json").exists() || cwd.join(".env").exists() {
        return Some(cwd);
    }

    if let Some(parent) = cwd.parent() {
        if parent.join("package.json").exists() || parent.join(".env").exists() {
            return Some(parent.to_path_buf());
        }
    }

    Some(cwd)
}

// ============================================================
// 辅助 — 字符边界安全的字符串预览
// ============================================================

pub fn safe_preview(s: &str, max_chars: usize) -> &str {
    if let Some((idx, _)) = s.char_indices().nth(max_chars) {
        &s[..idx]
    } else {
        s
    }
}

// ============================================================
// test_connection — 发送测试消息验证 API 连接
// ============================================================

pub async fn test_connection(
    api_key_override: &str,
    endpoint_override: &str,
    model_override: &str,
    logger: &Logger,
) -> Result<TestConnectionResult, String> {
    logger.write(
        Level::Info,
        "AI:Test",
        &format!(
            "test_ai_connection called | hasApiKey: {}",
            !api_key_override.is_empty()
        ),
    );

    // ---- 加载 .env ----
    if let Some(root) = find_project_root() {
        let env_path = root.join(".env");
        if env_path.exists() {
            logger.write(
                Level::Info,
                "AI:Test",
                &format!("loading .env from: {}", env_path.display()),
            );
            if let Err(e) = dotenvy::from_path(&env_path) {
                logger.write(
                    Level::Warn,
                    "AI:Test",
                    &format!(".env load failed: {}", e),
                );
            } else {
                logger.write(Level::Info, "AI:Test", ".env loaded successfully");
            }
        } else {
            logger.write(
                Level::Warn,
                "AI:Test",
                &format!("no .env file found at: {}", env_path.display()),
            );
        }
    }

    // ---- 读取配置 ----
    let config = AiConfig::from_env_with(api_key_override, endpoint_override, model_override);

    if config.api_key.is_empty() {
        logger.write(Level::Warn, "AI:Test", "no API key configured");
        return Ok(TestConnectionResult {
            ok: false,
            message: "未配置 API Key。请在设置页面填写 API Key，或在项目根目录 .env 文件中设置 AI_API_KEY。"
                .into(),
        });
    }

    logger.write(
        Level::Info,
        "AI:Test",
        &format!(
            "config | endpoint: {} | model: {} | keyLen: {} | anthropicNative: {}",
            config.endpoint,
            config.model,
            config.api_key.len(),
            config.is_anthropic_native
        ),
    );

    // ---- 构建 HTTP 请求 ----
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(TEST_CONNECTION_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let (auth_header_name, auth_header_value, request_body) = if config.is_anthropic_native {
        let body = serde_json::json!({
            "model": config.model,
            "max_tokens": 50,
            "system": "You are a connection test bot. Reply with just the word OK.",
            "messages": [
                { "role": "user", "content": "Hello, this is a connection test. Reply with just 'OK'." }
            ]
        });
        ("x-api-key".to_string(), config.api_key.clone(), body)
    } else {
        let body = serde_json::json!({
            "model": config.model,
            "messages": [
                { "role": "user", "content": "Hello, this is a connection test. Reply with just 'OK'." }
            ],
            "max_tokens": 50
        });
        ("Authorization".to_string(), format!("Bearer {}", config.api_key), body)
    };

    logger.write(Level::Info, "AI:Test", "sending HTTP request...");

    // ---- 发送请求 ----
    let t0 = std::time::Instant::now();
    let resp = client
        .post(&config.endpoint)
        .header(&auth_header_name, &auth_header_value)
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await;

    let elapsed_ms = t0.elapsed().as_millis();

    match resp {
        Ok(r) => {
            let status = r.status();
            logger.write(
                Level::Info,
                "AI:Test",
                &format!("response | status: {} | elapsed: {}ms", status, elapsed_ms),
            );

            if status.is_success() {
                let body_text = r.text().await.unwrap_or_default();
                let preview: String = safe_preview(&body_text, 200).to_string();
                logger.write(
                    Level::Info,
                    "AI:Test",
                    &format!("body preview: {}", preview.replace('\n', " ")),
                );

                if let Ok(parsed) =
                    serde_json::from_str::<ApiChatCompletionResponse>(&body_text)
                {
                    if let Some(choices) = parsed.choices {
                        if let Some(first) = choices.first() {
                            if let Some(msg) = &first.message {
                                if let Some(content) = &msg.content {
                                    logger.write(
                                        Level::Info,
                                        "AI:Test",
                                        &format!("AI response content: \"{}\"", content.trim()),
                                    );
                                }
                            }
                        }
                    }
                }

                let result_msg = format!("连接成功！AI 服务响应正常（{}ms）", elapsed_ms);
                logger.write(Level::Info, "AI:Test", &format!("result: OK | {}", result_msg));
                Ok(TestConnectionResult {
                    ok: true,
                    message: result_msg,
                })
            } else if status.as_u16() == 401 || status.as_u16() == 403 {
                let body_text = r.text().await.unwrap_or_default();
                logger.write(
                    Level::Warn,
                    "AI:Test",
                    &format!("auth error | status: {} | body: {}", status.as_u16(), body_text),
                );
                Ok(TestConnectionResult {
                    ok: false,
                    message: format!(
                        "认证失败（HTTP {}）。请检查 API Key 是否正确。",
                        status.as_u16()
                    ),
                })
            } else {
                let body_text = r.text().await.unwrap_or_default();
                logger.write(
                    Level::Warn,
                    "AI:Test",
                    &format!(
                        "unexpected status | status: {} | body: {}",
                        status.as_u16(),
                        body_text
                    ),
                );
                Ok(TestConnectionResult {
                    ok: false,
                    message: format!(
                        "AI 服务返回错误（HTTP {}），请检查 API 端点和模型配置。",
                        status.as_u16()
                    ),
                })
            }
        }
        Err(e) => {
            let msg = if e.is_timeout() {
                "连接超时（15s）。请检查网络或 API 端点是否可达。".to_string()
            } else if e.is_connect() {
                format!("无法连接到 API 服务。请检查 API 端点地址和网络连接。（{}）", e)
            } else {
                format!("请求失败：{}", e)
            };
            logger.write(Level::Error, "AI:Test", &format!("request failed | {}", msg));
            Ok(TestConnectionResult {
                ok: false,
                message: msg,
            })
        }
    }
}

/// ISO 8601 时间戳（UTC+8）
pub fn chrono_iso_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        + 8 * 3600;
    let days = (secs / 86400) as i64;
    let day_secs = (secs % 86400) as u32;
    let h = day_secs / 3600;
    let m = (day_secs % 3600) / 60;
    let s = day_secs % 60;
    let z = days + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let yr = if mo <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}+08:00", yr, mo, d, h, m, s)
}

// ============================================================
// chat_stream — 流式 AI 对话（返回 prompt_layer）
// ============================================================

/// 发起流式 AI 对话。
///
/// * `on_chunk` — 每收到一个文本片段就调用一次
/// * 返回值 — `Ok(prompt_layer)` 或 `Err(错误消息)`
pub async fn chat_stream<F>(
    req: &ChatRequest,
    logger: &Logger,
    mut on_chunk: F,
) -> Result<u8, String>
where
    F: FnMut(&str),
{
    logger.write(
        Level::Info,
        "AI:Chat",
        &format!(
            "chat_with_ai called | projectId: {} | msgLen: {} | historyRounds: {} | treeLen: {}",
            req.project_id,
            req.user_message.len(),
            req.history.len(),
            req.tree_json.len()
        ),
    );

    // ---- 读取配置 ----
    let config = AiConfig::from_env_with(&req.api_key, &req.api_endpoint, &req.model);

    if config.api_key.is_empty() {
        let msg = "未配置 API Key".to_string();
        logger.write(Level::Warn, "AI:Chat", "no API key configured");
        return Err(msg);
    }

    // ---- 解析 prompt（L3 > L2 > L1） ----
    let (system_prompt, prompt_layer) = prompt_manager::resolve_chat_prompt(req, logger);

    // ---- 构建 messages 数组 ----
    let mut messages: Vec<serde_json::Value> = Vec::new();

    if !config.is_anthropic_native {
        messages.push(serde_json::json!({
            "role": "system",
            "content": system_prompt
        }));
    }

    for entry in &req.history {
        if entry.role == "user" || entry.role == "ai" {
            let role = if entry.role == "ai" {
                "assistant"
            } else {
                "user"
            };
            messages.push(serde_json::json!({
                "role": role,
                "content": entry.text
            }));
        }
    }

    messages.push(serde_json::json!({
        "role": "user",
        "content": req.user_message
    }));

    // ---- 构建流式 HTTP 请求 ----
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(CHAT_STREAM_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let (auth_name, auth_value, request_body) = if config.is_anthropic_native {
        let body = serde_json::json!({
            "model": config.model,
            "max_tokens": 2048,
            "system": system_prompt,
            "messages": messages,
            "stream": true
        });
        (
            "x-api-key".to_string(),
            config.api_key.clone(),
            body,
        )
    } else {
        let body = serde_json::json!({
            "model": config.model,
            "messages": messages,
            "max_tokens": 2048,
            "stream": true
        });
        (
            "Authorization".to_string(),
            format!("Bearer {}", config.api_key),
            body,
        )
    };

    logger.write(
        Level::Info,
        "AI:Chat",
        &format!(
            "sending stream request | model: {} | messages: {} | anthropicNative: {}",
            config.model,
            messages.len(),
            config.is_anthropic_native
        ),
    );

    // ---- 发送流式请求 ----
    let t0 = std::time::Instant::now();
    let resp = client
        .post(&config.endpoint)
        .header(&auth_name, &auth_value)
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await;

    match resp {
        Ok(r) => {
            let status = r.status();
            logger.write(
                Level::Info,
                "AI:Chat",
                &format!(
                    "stream response | status: {} | elapsed: {}ms",
                    status,
                    t0.elapsed().as_millis()
                ),
            );

            if !status.is_success() {
                let body_text = r.text().await.unwrap_or_default();
                let err_msg = if status.as_u16() == 401 || status.as_u16() == 403 {
                    format!("AI 认证失败（HTTP {}），请检查 API Key", status.as_u16())
                } else {
                    format!("AI 服务返回错误（HTTP {}）", status.as_u16())
                };
                logger.write(
                    Level::Warn,
                    "AI:Chat",
                    &format!(
                        "error | status: {} | body: {}",
                        status.as_u16(),
                        body_text
                    ),
                );
                return Err(err_msg);
            }

            // ---- 读取 SSE 流 ----
            let mut stream = r.bytes_stream();
            let mut buffer = String::new();
            let mut total_chars: usize = 0;

            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(bytes) => {
                        let text = String::from_utf8_lossy(&bytes);
                        buffer.push_str(&text);

                        while let Some(nl_pos) = buffer.find('\n') {
                            let line = buffer[..nl_pos].trim().to_string();
                            buffer = buffer[nl_pos + 1..].to_string();

                            if line.is_empty() {
                                continue;
                            }

                            if let Some(data) = line.strip_prefix("data: ") {
                                if data == "[DONE]" {
                                    logger.write(Level::Info, "AI:Chat", "[DONE] received");
                                    break;
                                }

                                if let Ok(json) =
                                    serde_json::from_str::<serde_json::Value>(data)
                                {
                                    let content = if config.is_anthropic_native {
                                        json.get("delta")
                                            .and_then(|d| d.get("text"))
                                            .and_then(|t| t.as_str())
                                    } else {
                                        json.get("choices")
                                            .and_then(|c| c.get(0))
                                            .and_then(|c| c.get("delta"))
                                            .and_then(|d| d.get("content"))
                                            .and_then(|c| c.as_str())
                                    };

                                    if let Some(text) = content {
                                        if !text.is_empty() {
                                            total_chars += text.chars().count();
                                            on_chunk(text);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        logger.write(
                            Level::Warn,
                            "AI:Chat",
                            &format!("stream chunk error: {}", e),
                        );
                    }
                }
            }

            let elapsed = t0.elapsed().as_millis();
            logger.write(
                Level::Info,
                "AI:Chat",
                &format!(
                    "stream done | totalChars: {} | elapsed: {}ms | promptLayer: {}",
                    total_chars, elapsed, prompt_layer
                ),
            );

            Ok(prompt_layer)
        }
        Err(e) => {
            logger.write(Level::Error, "AI:Chat", &format!("request failed | {}", e));
            let msg = if e.is_timeout() {
                "AI 响应超时，请稍后重试".to_string()
            } else if e.is_connect() {
                "无法连接到 AI 服务，请检查网络".to_string()
            } else {
                format!("请求失败：{}", e)
            };
            Err(msg)
        }
    }
}

// ============================================================
// 分析功能 — AI 项目结构分析（拆分为两次独立调用）
// ============================================================

// ---- 公共：发送非流式请求 → 提取 content → 存档 → 提取 JSON ----

/// 发送 AI 请求，提取 content 文本，存档到 ai_debug，然后提取 JSON
/// 返回 `(json_str, debug_path)`
async fn call_ai_for_analysis(
    system_prompt: &str,
    user_message: &str,
    req: &AnalyzeRequest,
    logger: &Logger,
    tag: &str,
    max_tokens: u32,
) -> Result<(String, String), String> {
    let config = AiConfig::from_env_with(&req.api_key, &req.api_endpoint, &req.model);

    if config.api_key.is_empty() {
        return Err("未配置 API Key。请在设置页面配置或项目根目录 .env 文件中设置 AI_API_KEY。".into());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(ANALYSIS_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let (auth_name, auth_value, request_body) = if config.is_anthropic_native {
        let body = serde_json::json!({
            "model": config.model,
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": [
                { "role": "user", "content": user_message }
            ]
        });
        ("x-api-key".to_string(), config.api_key.clone(), body)
    } else {
        let body = serde_json::json!({
            "model": config.model,
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_message }
            ],
            "max_tokens": max_tokens
        });
        ("Authorization".to_string(), format!("Bearer {}", config.api_key), body)
    };

    logger.write(
        Level::Info,
        tag,
        &format!(
            "sending request | model: {} | anthropicNative: {}",
            config.model, config.is_anthropic_native
        ),
    );

    let t0 = std::time::Instant::now();
    let resp = client
        .post(&config.endpoint)
        .header(&auth_name, &auth_value)
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await;

    match resp {
        Ok(r) => {
            let status = r.status();
            logger.write(
                Level::Info,
                tag,
                &format!("response | status: {} | elapsed: {}ms", status, t0.elapsed().as_millis()),
            );

            if !status.is_success() {
                let body_text = r.text().await.unwrap_or_default();
                let err_msg = if status.as_u16() == 401 || status.as_u16() == 403 {
                    "AI 认证失败，请检查 API Key".to_string()
                } else {
                    format!("AI 服务返回错误（HTTP {}）", status.as_u16())
                };
                logger.write(Level::Warn, tag, &format!("error | {}", body_text));
                return Err(err_msg);
            }

            let body_text = r.text().await.unwrap_or_default();
            logger.write(Level::Debug, tag, &format!("raw response | len: {}", body_text.len()));

            // 解析 API 外层 JSON
            let parsed: serde_json::Value = serde_json::from_str(&body_text).map_err(|e| {
                logger.write(Level::Warn, tag, &format!("API JSON parse error | {}", e));
                format!("AI 返回的不是有效 JSON: {}", safe_preview(&body_text, 200))
            })?;

            let content = if config.is_anthropic_native {
                parsed
                    .get("content")
                    .and_then(|c| c.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|block| block.get("text"))
                    .and_then(|t| t.as_str())
            } else {
                parsed
                    .get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("message"))
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_str())
            }
            .unwrap_or("");

            if content.is_empty() {
                logger.write(Level::Warn, tag, "AI 返回空内容");
                return Err("AI 返回了空内容，请重试".into());
            }

            // 存档到 ai_debug
            let mut debug_path = String::from("(未保存)");
            if !req.data_dir.is_empty() {
                if let Ok(path) = crate::services::data_files::resolve_ai_debug_path(
                    &req.data_dir,
                    &format!("{}_{}", req.project_name, tag.split(':').next_back().unwrap_or("analysis")),
                ) {
                    let debug_data = serde_json::json!({
                        "timestamp": chrono_iso_now(),
                        "project_name": req.project_name,
                        "project_id": req.project_id,
                        "model": config.model,
                        "tag": tag,
                        "raw_content": content,
                    });
                    if let Ok(json) = serde_json::to_string_pretty(&debug_data) {
                        match crate::services::data_files::atomic_write_json(&path, &json, logger) {
                            Ok(()) => debug_path = path.display().to_string(),
                            Err(e) => logger.write(Level::Warn, tag, &format!("保存 ai_debug 失败: {}", e)),
                        }
                    }
                }
            }
            logger.write(Level::Info, tag, &format!("原始响应已存档: {}", debug_path));

            // 提取 JSON
            let json_str = extract_json_from_text(content);
            Ok((json_str, debug_path))
        }
        Err(e) => {
            logger.write(Level::Error, tag, &format!("request failed | {}", e));
            let msg = if e.is_timeout() {
                format!("AI 分析超时（{}s），请稍后重试", ANALYSIS_TIMEOUT_SECS)
            } else if e.is_connect() {
                "无法连接到 AI 服务，请检查网络".to_string()
            } else {
                format!("请求失败：{}", e)
            };
            Err(msg)
        }
    }
}

/// 容错解析核心分析响应
fn parse_core_analysis_fallback(
    json_str: &str,
    raw_content: &str,
    logger: &Logger,
) -> Result<AnalyzeCoreResponse, String> {
    let parsed: serde_json::Value = serde_json::from_str(json_str).map_err(|e| {
        format!(
            "容错解析也失败，AI 原始响应已存档到 ai_debug/ 目录 | error: {} | preview: {}",
            e,
            safe_preview(raw_content, 300)
        )
    })?;

    let summary = parsed
        .get("summary")
        .and_then(|v| v.as_str())
        .unwrap_or("（AI 未返回摘要）")
        .to_string();

    let suggested_next_steps = to_string_list(
        parsed
            .get("suggestedNextSteps")
            .or_else(|| parsed.get("suggested_next_steps"))
            .unwrap_or(&serde_json::Value::Array(vec![])),
    );

    let structure_insights = to_string_list(
        parsed
            .get("structureInsights")
            .or_else(|| parsed.get("structure_insights"))
            .unwrap_or(&serde_json::Value::Array(vec![])),
    );

    let risks = to_string_list(
        parsed.get("risks").unwrap_or(&serde_json::Value::Array(vec![])),
    );

    logger.write(
        Level::Info,
        "AI:AnalyzeCore",
        &format!(
            "容错解析成功 | summary: {} chars | nextSteps: {} | insights: {} | risks: {}",
            summary.len(), suggested_next_steps.len(), structure_insights.len(), risks.len(),
        ),
    );

    Ok(AnalyzeCoreResponse { summary, suggested_next_steps, structure_insights, risks })
}

/// 发起核心分析
pub async fn analyze_project_core(
    req: &AnalyzeRequest,
    logger: &Logger,
) -> Result<AnalyzeCoreResponse, String> {
    logger.write(
        Level::Info,
        "AI:AnalyzeCore",
        &format!("called | projectId: {} | name: {}", req.project_id, req.project_name),
    );

    let system_prompt = prompt_manager::resolve_core_analysis_prompt(req, logger);
    let (json_str, _debug_path) = call_ai_for_analysis(
        &system_prompt,
        "请分析这个项目。",
        req,
        logger,
        "AI:AnalyzeCore",
        2048,
    )
    .await?;

    // 标准反序列化
    match serde_json::from_str::<AnalyzeCoreResponse>(&json_str) {
        Ok(r) => {
            logger.write(
                Level::Info,
                "AI:AnalyzeCore",
                &format!("分析完成 | summary: {} chars | nextSteps: {} | insights: {} | risks: {}",
                    r.summary.len(), r.suggested_next_steps.len(), r.structure_insights.len(), r.risks.len()),
            );
            Ok(r)
        }
        Err(e) => {
            logger.write(
                Level::Warn,
                "AI:AnalyzeCore",
                &format!("标准解析失败，尝试容错 | error: {}", e),
            );
            parse_core_analysis_fallback(&json_str, "", logger)
        }
    }
}

/// 发起文件整理方案分析
pub async fn analyze_project_file_org(
    req: &AnalyzeRequest,
    logger: &Logger,
) -> Result<AnalyzeFileOrgResponse, String> {
    logger.write(
        Level::Info,
        "AI:AnalyzeFileOrg",
        &format!("called | projectId: {} | name: {}", req.project_id, req.project_name),
    );

    // 文件整理使用内置 L1 prompt（不支持 L2 自定义）
    let system_prompt = prompt_manager::build_file_org_prompt(req);
    let (json_str, _debug_path) = call_ai_for_analysis(
        &system_prompt,
        "请给出文件整理方案。",
        req,
        logger,
        "AI:AnalyzeFileOrg",
        8192,
    )
    .await?;

    // 解析
    let mut text = match serde_json::from_str::<AnalyzeFileOrgResponse>(&json_str) {
        Ok(r) => r.file_organization,
        Err(_e) => {
            // 容错：手动提取 fileOrganization 字段，兼容对象/数组/字符串
            logger.write(Level::Warn, "AI:AnalyzeFileOrg", "标准解析失败，容错提取");
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str) {
                let fo = parsed
                    .get("fileOrganization")
                    .or_else(|| parsed.get("file_organization"));
                match fo {
                    Some(serde_json::Value::String(s)) => s.clone(),
                    Some(v @ (serde_json::Value::Object(_) | serde_json::Value::Array(_))) => {
                        serde_json::to_string_pretty(v).unwrap_or_else(|_| v.to_string())
                    }
                    _ => json_str.to_string(),
                }
            } else {
                json_str.to_string()
            }
        }
    };

    // 兜底：AI 可能把 \\n 当成字面量输出（JSON 里写成 \\\\n → 解析后是字面量 \\n）
    if !text.contains('\n') && text.contains("\\n") {
        text = text.replace("\\n", "\n");
    }

    logger.write(
        Level::Info,
        "AI:AnalyzeFileOrg",
        &format!("分析完成 | fileOrg: {} chars", text.len()),
    );
    Ok(AnalyzeFileOrgResponse { file_organization: text })
}

/// 从文本中提取 JSON（兼容 ```json ... ``` 包裹格式，括号深度匹配）
fn extract_json_from_text(text: &str) -> String {
    let text = text.trim();

    // 尝试直接解析
    if text.starts_with('{') {
        return extract_balanced_json(text);
    }

    // 尝试提取 ```json ... ``` 代码块
    if let Some(start) = text.find("```json") {
        let after_open = &text[start + 7..];
        if let Some(end) = after_open.find("```") {
            let inner = after_open[..end].trim();
            if inner.starts_with('{') {
                return extract_balanced_json(inner);
            }
        }
    }

    // 尝试提取 ``` ... ``` 代码块（无语言标记）
    if let Some(start) = text.find("```") {
        let after_open = &text[start + 3..];
        if let Some(end) = after_open.find("```") {
            let inner = after_open[..end].trim();
            if inner.starts_with('{') {
                return extract_balanced_json(inner);
            }
        }
    }

    // 最后尝试找第一个 { 后用括号深度匹配
    if let Some(start) = text.find('{') {
        return extract_balanced_json(&text[start..]);
    }

    text.to_string()
}

/// 用括号深度匹配提取完整的 JSON 对象，截断尾部多余文字
/// 输入必须以 '{' 开头
fn extract_balanced_json(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut depth: i32 = 0;
    let mut in_string = false;
    let mut escape = false;
    let mut end_idx = 0;

    for (i, &ch) in chars.iter().enumerate() {
        if escape {
            escape = false;
            continue;
        }
        if ch == '\\' && in_string {
            escape = true;
            continue;
        }
        if ch == '"' {
            in_string = !in_string;
            continue;
        }
        if in_string {
            continue;
        }
        if ch == '{' {
            depth += 1;
        } else if ch == '}' {
            depth -= 1;
            if depth == 0 {
                end_idx = i + 1;
                break;
            }
        }
    }

    if end_idx > 0 {
        chars[..end_idx].iter().collect()
    } else {
        s.to_string()
    }
}

/// 将 serde_json::Value 转为字符串列表（容错：字符串→单元素数组，对象→提取值）
fn to_string_list(v: &serde_json::Value) -> Vec<String> {
    match v {
        serde_json::Value::Array(arr) => arr
            .iter()
            .filter_map(|item| item.as_str().map(|s| s.to_string()))
            .collect(),
        serde_json::Value::String(s) => {
            if s.is_empty() {
                vec![]
            } else {
                vec![s.clone()]
            }
        }
        serde_json::Value::Object(map) => map
            .values()
            .filter_map(|val| val.as_str().map(|s| s.to_string()))
            .collect(),
        _ => vec![],
    }
}
