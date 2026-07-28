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
    SystemPromptData, TestConnectionResult,
};
use crate::utils::logger::{Level, Logger};

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
        .timeout(std::time::Duration::from_secs(15))
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

// ============================================================
// Layer 1 — 兜底 prompt 模板
// ============================================================

pub fn build_chat_fallback_prompt(req: &ChatRequest) -> String {
    let tree_text = format_tree_for_prompt(&req.tree_json);

    let status_display = match req.status.as_str() {
        "not-started" => "未开始",
        "in-progress" => "进行中",
        "nearing-completion" => "临近完成",
        "completed" => "已完成",
        _ => req.status.as_str(),
    };

    let notes_display = if req.notes.is_empty() {
        "（无）"
    } else {
        &req.notes
    };
    let next_steps_display = if req.next_steps.is_empty() {
        "（未设定）"
    } else {
        &req.next_steps
    };

    format!(
        r#"你是一个专业的项目开发助手，正在帮助用户管理一个软件项目目录。
请始终根据下方「项目信息」和「项目目录结构」来理解用户的问题，并给出实用的建议。

---

## 项目信息

- **名称**：{project_name}
- **路径**：{project_path}
- **状态**：{status}
- **备注**：{notes}
- **下一步工作**：{next_steps}

## 项目目录结构

```
{tree}
```

## 对话规则

1. 用户每次只发一条消息，你需要给出简洁、可操作的回答
2. 回答围绕用户的项目展开，参考上面的项目信息和目录结构
3. 如果用户要求修改代码，请给出具体的文件名、位置和修改建议
4. 如果问题超出项目范围，可做简要说明后回到项目语境
5. 使用中文回复，代码片段和文件名保留原文
6. 如果用户要求生成代码或文档，请尽量提供完整示例，并标明文件路径和内容
7. 如果用户要求分析项目，请结合目录结构和文件类型给出可行的下一步工作建议
8. 如果用户要求总结项目，请根据目录结构和文件类型给出简要概览
9. 如果用户要求优化项目结构，请结合目录层级和文件类型给出合理的优化方案
10. 如果用户要求检查项目风险，请结合目录结构和文件类型给出潜在风险点和注意事项
11. 如果用户要求提供项目结构洞察，请结合目录层级和文件类型给出有价值的分析和建议
12. 如果用户要求提供项目文档建议，请结合目录结构和文件类型给出可行的文档完善方案
13. 非必要情况下不要生成过长的内容和过多的图标，尽量保持回答简洁明了

---

（如果用户为此项目设定了「AI 项目规则」，会追加在下方。请优先遵守项目规则中的约束。）
"#,
        project_name = req.project_name,
        project_path = req.project_path,
        status = status_display,
        notes = notes_display,
        next_steps = next_steps_display,
        tree = tree_text,
    )
}

// ============================================================
// 辅助 — 将目录树 JSON 格式化为缩进文本（ASCII tree）
// ============================================================

pub fn format_tree_for_prompt(json: &str) -> String {
    let parsed: serde_json::Value = match serde_json::from_str(json) {
        Ok(v) => v,
        Err(_) => return "(无法解析目录结构)".to_string(),
    };

    let mut out = String::new();
    format_tree_node(&parsed, "", true, &mut out);
    out
}

fn format_tree_node(node: &serde_json::Value, prefix: &str, is_last: bool, out: &mut String) {
    let name = node
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("?");
    let is_dir = node
        .get("isDir")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let children = node.get("children").and_then(|v| v.as_array());

    let branch = if is_last { "└── " } else { "├── " };
    out.push_str(&format!("{}{}{}\n", prefix, branch, name));

    if is_dir {
        if let Some(kids) = children {
            let child_prefix = format!(
                "{}{}   ",
                prefix,
                if is_last { " " } else { "│" }
            );
            for (i, child) in kids.iter().enumerate() {
                let child_last = i == kids.len() - 1;
                format_tree_node(child, &child_prefix, child_last, out);
            }
        }
    }
}

// ============================================================
// prompt 文件路径解析
// ============================================================

/// 解析 prompts.json 的完整路径
/// - `data_dir` 非空 → `{data_dir}/prompts.json`
/// - `data_dir` 为空 → 返回 None（由调用方决定回退策略）
pub fn resolve_prompt_path(data_dir: &str) -> Option<PathBuf> {
    if data_dir.is_empty() {
        return None;
    }
    let dir = std::path::Path::new(data_dir);
    if dir.exists() {
        Some(dir.join("prompts.json"))
    } else {
        None
    }
}

// ============================================================
// prompt 读写
// ============================================================

/// 加载全局系统 prompt（Layer 2）
/// 返回 `Ok(None)` 表示文件不存在或为空（调用方应降级到 Layer 1）
pub fn load_system_prompt(data_dir: &str, logger: &Logger) -> Result<Option<String>, String> {
    let path = match resolve_prompt_path(data_dir) {
        Some(p) => p,
        None => {
            logger.write(
                Level::Info,
                "AI:Prompt",
                "dataDir 为空，跳过 prompts.json 加载",
            );
            return Ok(None);
        }
    };

    if !path.exists() {
        logger.write(
            Level::Info,
            "AI:Prompt",
            &format!("prompts.json 不存在: {}", path.display()),
        );
        return Ok(None);
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("读取 prompts.json 失败: {}", e))?;

    let data: SystemPromptData = serde_json::from_str(&content)
        .map_err(|e| format!("解析 prompts.json 失败: {}", e))?;

    if data.system_prompt.trim().is_empty() {
        logger.write(Level::Info, "AI:Prompt", "prompts.json 中 system_prompt 为空");
        return Ok(None);
    }

    logger.write(
        Level::Info,
        "AI:Prompt",
        &format!(
            "成功加载全局系统 prompt | len: {} | path: {}",
            data.system_prompt.len(),
            path.display()
        ),
    );
    Ok(Some(data.system_prompt))
}

/// 读取已有 prompts.json（不存在则返回 Default）
fn load_prompt_data(data_dir: &str) -> Result<SystemPromptData, String> {
    if data_dir.is_empty() {
        return Ok(SystemPromptData::default());
    }
    let path = std::path::Path::new(data_dir).join("prompts.json");
    if !path.exists() {
        return Ok(SystemPromptData::default());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("读取 prompts.json 失败: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("解析 prompts.json 失败: {}", e))
}

/// 原子写入 prompts.json
fn save_prompt_data(data_dir: &str, data: &SystemPromptData, logger: &Logger) -> Result<(), String> {
    if data_dir.is_empty() {
        return Err("数据存储路径未设置".into());
    }
    let dir = std::path::Path::new(data_dir);
    std::fs::create_dir_all(dir)
        .map_err(|e| format!("创建数据目录失败: {}", e))?;

    let path = dir.join("prompts.json");
    let tmp_path = dir.join("prompts.json.tmp");

    let json = serde_json::to_string_pretty(data)
        .map_err(|e| format!("序列化失败: {}", e))?;

    std::fs::write(&tmp_path, &json)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;
    std::fs::rename(&tmp_path, &path)
        .map_err(|e| format!("替换 prompts.json 失败: {}", e))?;

    logger.write(
        Level::Info,
        "AI:Prompt",
        &format!("prompts.json 已保存 | path: {} | size: {}B", path.display(), json.len()),
    );
    Ok(())
}

/// 保存全局对话 prompt（Layer 2）— 保留已有 analysis_prompt
pub fn save_system_prompt(
    data_dir: &str,
    prompt_text: &str,
    logger: &Logger,
) -> Result<(), String> {
    let mut data = load_prompt_data(data_dir).unwrap_or_default();
    data.last_modified = chrono_iso_now();
    data.system_prompt = prompt_text.to_string();
    save_prompt_data(data_dir, &data, logger)
}

/// 保存全局分析 prompt（Layer 2）— 保留已有 system_prompt
pub fn save_analysis_prompt(
    data_dir: &str,
    prompt_text: &str,
    logger: &Logger,
) -> Result<(), String> {
    let mut data = load_prompt_data(data_dir).unwrap_or_default();
    data.last_modified = chrono_iso_now();
    data.analysis_prompt = prompt_text.to_string();
    save_prompt_data(data_dir, &data, logger)
}

/// 加载全局分析 prompt
pub fn load_analysis_prompt(data_dir: &str, logger: &Logger) -> Result<Option<String>, String> {
    let path = match resolve_prompt_path(data_dir) {
        Some(p) => p,
        None => return Ok(None),
    };
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("读取 prompts.json 失败: {}", e))?;
    let data: SystemPromptData = serde_json::from_str(&content)
        .map_err(|e| format!("解析 prompts.json 失败: {}", e))?;

    if data.analysis_prompt.trim().is_empty() {
        Ok(None)
    } else {
        logger.write(
            Level::Info,
            "AI:Analyze",
            &format!("加载全局分析 prompt | len: {}", data.analysis_prompt.len()),
        );
        Ok(Some(data.analysis_prompt))
    }
}

/// 替换分析 prompt 中的变量占位符
fn substitute_analysis_variables(prompt: &str, req: &AnalyzeRequest) -> String {
    let tree_text = format_tree_for_prompt(&req.tree_json);

    let status_display = match req.status.as_str() {
        "not-started" => "未开始",
        "in-progress" => "进行中",
        "nearing-completion" => "临近完成",
        "completed" => "已完成",
        _ => req.status.as_str(),
    };

    prompt
        .replace("{projectName}", &req.project_name)
        .replace("{projectPath}", &req.project_path)
        .replace("{status}", status_display)
        .replace("{notes}", &req.notes)
        .replace("{nextSteps}", &req.next_steps)
        .replace("{tree}", &tree_text)
}

/// 在文本中查找完整单词（以非字母数字字符为边界）
fn contains_word(haystack: &str, word: &str) -> bool {
    let lower = haystack.to_lowercase();
    let w = word.to_lowercase();
    lower.split(|c: char| !c.is_alphanumeric()).any(|part| part == w)
}

/// 校验分析 prompt 的结构完整性（发送给 AI 前的最后一道防线）
/// 返回 None 表示通过，Some(String) 为失败原因
fn validate_analysis_prompt(prompt: &str) -> Option<String> {
    let trimmed = prompt.trim();
    if trimmed.is_empty() {
        return Some("prompt 为空".into());
    }

    let mut issues: Vec<String> = Vec::new();
    let lower = trimmed.to_lowercase();

    // 规则 1：必须包含 {tree} 变量
    if !trimmed.contains("{tree}") {
        issues.push("缺少 {tree} 变量".into());
    }

    // 规则 2：必须包含 JSON 格式输出指令
    let has_json = lower.contains("json");
    let output_kw = ["返回", "输出", "回复", "给出", "respond", "return", "output", "reply"]
        .iter()
        .any(|kw| lower.contains(kw));
    let json_fmt_kw = ["json格式", "json对象", "json object", "json format"]
        .iter()
        .any(|kw| lower.contains(kw));
    let must_json = (lower.contains("必须是") || lower.contains("应该是") || lower.contains("只") || lower.contains("仅"))
        && lower.contains("json");
    // json 后面紧跟输出语义
    let json_then_output = {
        let json_pos = lower.find("json");
        json_pos.is_some_and(|p| {
            let after = &lower[p..];
            ["输出", "返回", "回复", "output", "return", "reply"]
                .iter()
                .any(|kw| after.contains(kw))
        })
    };

    let has_json_output = has_json && (output_kw || json_fmt_kw || must_json || json_then_output);
    if !has_json_output {
        issues.push("未明确要求 JSON 格式输出".into());
    }

    // 规则 3：至少提及 2 个必需字段（核心分析 4 字段）
    let field_checks: [(&str, &str); 4] = [
        ("summary", "summary"),
        ("suggestedNextSteps", "suggestednextsteps"),
        ("structureInsights", "structureinsights"),
        ("risks", "risks"),
    ];
    let mut matched = std::collections::HashSet::new();
    for (canonical, alt) in &field_checks {
        // 匹配 camelCase / snake_case / 空格分隔 变体
        if contains_word(trimmed, canonical)
            || contains_word(trimmed, alt)
            || lower.contains(&alt.to_lowercase())
        {
            matched.insert(*canonical);
        }
    }
    if matched.len() < 2 {
        issues.push(format!(
            "输出字段覆盖不足（{} 个，需 ≥2）",
            matched.len()
        ));
    }

    // 规则 4：长度 ≥ 40 字符
    if trimmed.chars().count() < 40 {
        issues.push(format!(
            "提示词过短（{} 字符，需 ≥40）",
            trimmed.chars().count()
        ));
    }

    // 规则 5：花括号配对（排除变量占位符 {xxx}）
    let cleaned = remove_variable_placeholders(trimmed);
    let mut depth: i32 = 0;
    for ch in cleaned.chars() {
        if ch == '{' {
            depth += 1;
        }
        if ch == '}' {
            depth -= 1;
        }
    }
    if depth != 0 {
        issues.push(format!("花括号不配对（差值 {}）", depth));
    }

    if issues.is_empty() {
        None
    } else {
        Some(issues.join("；"))
    }
}

/// 移除 {variableName} 格式的变量占位符，返回剩余文本
fn remove_variable_placeholders(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut result = String::with_capacity(s.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '{' {
            // 尝试匹配 {xxx} 模式
            let start = i;
            i += 1;
            let mut valid_var = false;
            while i < chars.len() {
                if chars[i] == '}' {
                    // 检查花括号内是否全是字母
                    let inner: String = chars[start + 1..i].iter().collect();
                    if !inner.is_empty() && inner.chars().all(|c| c.is_alphabetic()) {
                        valid_var = true;
                    }
                    i += 1;
                    break;
                }
                if !chars[i].is_alphabetic() {
                    break;
                }
                i += 1;
            }
            if !valid_var {
                // 不是变量占位符，保留原字符
                result.push('{');
                if i == start + 1 {
                    // 只有一个 { 没匹配到
                    continue;
                }
            }
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }
    result
}

/// 解析核心分析 prompt — Layer 2 > Layer 1
pub fn resolve_core_analysis_prompt(req: &AnalyzeRequest, logger: &Logger) -> String {
    // Layer 2: 全局分析 prompt（从 prompts.json），需替换变量
    if let Ok(Some(prompt)) = load_analysis_prompt(&req.data_dir, logger) {
        // 校验 L2 prompt 结构完整性，不通过则降级到 L1
        if let Some(reason) = validate_analysis_prompt(&prompt) {
            logger.write(
                Level::Warn,
                "AI:AnalyzeCore",
                &format!("Layer 2 prompt 校验失败: {} → 降级到 Layer 1", reason),
            );
        } else {
            logger.write(Level::Info, "AI:AnalyzeCore", "使用 Layer 2（全局分析 prompt）");
            return substitute_analysis_variables(&prompt, req);
        }
    }
    // Layer 1: 兜底
    logger.write(Level::Info, "AI:AnalyzeCore", "使用 Layer 1（内置分析 prompt）");
    build_core_analysis_prompt(req)
}

// ============================================================
// 项目规则读写（Layer 3 — .project-tracker/prompt.json）
// ============================================================

/// 读取项目规则（不包含 version 包装，纯文本）
fn load_project_rules_raw(project_path: &str, logger: &Logger) -> Option<String> {
    let root = std::path::Path::new(project_path);
    let tracker_prompt = root.join(".project-tracker").join("prompt.json");
    let legacy = root.join("ai-prompt.json");

    // 优先新位置，回退旧位置（自动迁移）
    let path = if tracker_prompt.exists() {
        tracker_prompt
    } else if legacy.exists() {
        logger.write(
            Level::Info,
            "AI:Chat",
            "检测到旧 ai-prompt.json，迁移到 .project-tracker/",
        );
        if let Some(parent) = tracker_prompt.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        if std::fs::rename(&legacy, &tracker_prompt).is_ok() {
            logger.write(Level::Info, "AI:Chat", "旧 prompt 已迁移");
            tracker_prompt
        } else {
            legacy
        }
    } else {
        return None;
    };

    if !path.exists() {
        return None;
    }

    let content = std::fs::read_to_string(&path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    // 兼容旧字段名 systemPrompt
    let rules = json
        .get("projectRules")
        .or_else(|| json.get("systemPrompt"))
        .and_then(|v| v.as_str())?;

    if rules.trim().is_empty() {
        None
    } else {
        Some(rules.to_string())
    }
}

/// 保存项目规则（原子写入 .project-tracker/prompt.json）
pub fn save_project_rules(
    project_path: &str,
    rules: &str,
    logger: &Logger,
) -> Result<(), String> {
    let root = std::path::Path::new(project_path);
    if !root.exists() || !root.is_dir() {
        return Err("项目路径无效".into());
    }

    let dir = root.join(".project-tracker");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("创建目录失败: {}", e))?;

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("attrib")
            .arg("+h")
            .arg(dir.as_os_str())
            .output();
    }

    let path = dir.join("prompt.json");
    let tmp = dir.join("prompt.json.tmp");

    let data = serde_json::json!({
        "version": "1.0",
        "last_modified": chrono_iso_now(),
        "projectRules": rules,
    });

    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("序列化失败: {}", e))?;

    std::fs::write(&tmp, &json).map_err(|e| format!("写入失败: {}", e))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("保存失败: {}", e))?;

    logger.write(
        Level::Info,
        "AI:ProjectRules",
        &format!("项目规则已保存 | path: {} | len: {}", path.display(), rules.len()),
    );
    Ok(())
}

/// 读取项目规则（对外接口）
pub fn load_project_rules(project_path: &str, logger: &Logger) -> Option<String> {
    load_project_rules_raw(project_path, logger)
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
// Prompt 解析 — Layer 2 为基础，Layer 3 追加
// ============================================================

/// 替换对话 prompt 中的变量占位符
fn substitute_chat_variables(prompt: &str, req: &ChatRequest) -> String {
    let tree_text = format_tree_for_prompt(&req.tree_json);

    let status_display = match req.status.as_str() {
        "not-started" => "未开始",
        "in-progress" => "进行中",
        "nearing-completion" => "临近完成",
        "completed" => "已完成",
        _ => req.status.as_str(),
    };

    prompt
        .replace("{projectName}", &req.project_name)
        .replace("{projectPath}", &req.project_path)
        .replace("{status}", status_display)
        .replace("{notes}", &req.notes)
        .replace("{nextSteps}", &req.next_steps)
        .replace("{tree}", &tree_text)
}

pub fn resolve_chat_prompt(req: &ChatRequest, logger: &Logger) -> (String, u8) {
    // 1. 确定基础 prompt（Layer 1 或 Layer 2）
    let (base_prompt, base_layer) = if let Ok(Some(global_prompt)) =
        load_system_prompt(&req.data_dir, logger)
    {
        let substituted = substitute_chat_variables(&global_prompt, req);
        logger.write(
            Level::Info,
            "AI:Chat",
            &format!("基础 prompt: Layer 2（已替换变量）| len: {}", substituted.len()),
        );
        (substituted, 2u8)
    } else {
        logger.write(Level::Info, "AI:Chat", "基础 prompt: Layer 1（兜底）");
        (build_chat_fallback_prompt(req), 1u8)
    };

    // 2. 检查项目规则（Layer 3 追加，不替换）
    if let Some(rules) = load_project_rules_raw(&req.project_path, logger) {
        let combined = format!(
            "{}\n\n---\n\n## 项目补充规则\n\n{}",
            base_prompt, rules
        );
        logger.write(
            Level::Info,
            "AI:Chat",
            &format!(
                "Layer 3 项目规则已追加 | 总长度: {}",
                combined.len()
            ),
        );
        return (combined, 3);
    }

    (base_prompt, base_layer)
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
    let (system_prompt, prompt_layer) = resolve_chat_prompt(req, logger);

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
        .timeout(std::time::Duration::from_secs(120))
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
        .timeout(std::time::Duration::from_secs(60))
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
                "AI 分析超时（60s），请稍后重试".to_string()
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
// 调用 1：核心分析（概述 + 建议 + 洞察 + 风险）
// ============================================================

/// L1 核心分析兜底 prompt
pub fn build_core_analysis_prompt(req: &AnalyzeRequest) -> String {
    let tree_text = format_tree_for_prompt(&req.tree_json);

    let status_display = match req.status.as_str() {
        "not-started" => "未开始",
        "in-progress" => "进行中",
        "nearing-completion" => "临近完成",
        "completed" => "已完成",
        _ => req.status.as_str(),
    };

    let notes_display = if req.notes.is_empty() { "（无）" } else { &req.notes };
    let next_steps_display = if req.next_steps.is_empty() { "（未设定）" } else { &req.next_steps };

    format!(
        r#"你是一个专业的项目文件管理助手。请分析以下项目的目录结构，给出结构化的分析结果。

---

## 项目信息

- **名称**：{project_name}
- **路径**：{project_path}
- **状态**：{status}
- **备注**：{notes}
- **下一步工作**：{next_steps}

## 项目目录结构

```
{tree}
```

---

## 分析要求

请根据以上项目信息，给出一个简要的分析报告。你的回答必须是一个严格的 JSON 对象，不要包含其他文字。

JSON 格式：
```json
{{
  "summary": "一段 200 字以内的中文摘要，概括项目的整体情况、目录特征和当前阶段",
  "suggestedNextSteps": [
    "具体的下一步工作建议 1",
    "具体的下一步工作建议 2",
    "具体的下一步工作建议 3"
  ],
  "structureInsights": [
    "关于目录结构的洞察/建议 1",
    "关于目录结构的洞察/建议 2",
    "关于目录结构的洞察/建议 3"
  ],
  "risks": [
    "潜在风险或注意事项 1",
    "潜在风险或注意事项 2"
  ]
}}
```

要求：
1. 摘要要结合项目实际的目录结构和文件类型，不要泛泛而谈
2. 建议要具体可执行，优先结合已有的"下一步工作"
3. 结构洞察要关注目录层级、模块划分、文件组织
4. 如果是个代码库，关注代码质量、安全、依赖管理等方面
5. 每个数组至少给出 2 条，不要超过 5 条
6. 使用中文回复
7. 只返回 JSON，不要有其他文字
"#,
        project_name = req.project_name,
        project_path = req.project_path,
        status = status_display,
        notes = notes_display,
        next_steps = next_steps_display,
        tree = tree_text,
    )
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

    let system_prompt = resolve_core_analysis_prompt(req, logger);
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

// ============================================================
// 调用 2：文件整理方案（树形文本）
// ============================================================

/// L1 文件整理方案兜底 prompt
pub fn build_file_org_prompt(req: &AnalyzeRequest) -> String {
    let tree_text = format_tree_for_prompt(&req.tree_json);

    let status_display = match req.status.as_str() {
        "not-started" => "未开始",
        "in-progress" => "进行中",
        "nearing-completion" => "临近完成",
        "completed" => "已完成",
        _ => req.status.as_str(),
    };

    format!(
        r#"你是一个项目文件结构管理专家。请分析以下项目目录结构，给出一个文件整理后的理想目录树。

---

## 项目信息

- **名称**：{project_name}
- **路径**：{project_path}
- **状态**：{status}

## 当前目录结构

```
{tree}
```

---

## 要求

1. 分析当前目录的混乱之处，然后给出整理后的完整目录树
2. 输出格式必须是 `tree` 命令风格的 ASCII 树形图，例如：
   ```
   项目根目录/
   ├── 合同与协议/
   │   ├── 开发合同.docx
   │   └── 修订合同.docx
   ├── 需求与设计/
   │   ├── 需求文档.docx
   │   └── 功能设计.docx
   ├── 报名材料/
   │   ├── 张三_安全承诺书.docx
   │   └── 李四_安全承诺书.docx
   ├── 图片素材/
   │   ├── IMG_001.jpg
   │   └── IMG_002.jpg
   └── README.md  # 项目说明文件
   ```
3. 每个目录/文件可附带简短注释（用 `#` 开头），说明其用途
4. 保留当前目录的优点，只调整混乱的部分；结构合理则说明无需大改
5. 文件名保留原文

## 输出格式（极其重要！必须严格遵守！）

你必须返回一个严格的 JSON 对象。**fileOrganization 字段的值必须是一个纯文本字符串！**

在 JSON 中，换行符写成 \\n（一个反斜杠加字母 n）。不要写成 \\\\n（两个反斜杠），那是错误的！
反斜杠 \\n 在 JSON 解析后会变成真正的换行。

正确示例：
```json
{{
  "fileOrganization": "项目根目录/\\n├── 文档/\\n│   ├── 合同.docx\\n│   └── 需求.docx\\n├── 源码/\\n└── README.md"
}}
```

注意：上面 JSON 中每一行末尾的 \\n 是换行符，不是字面量文本。

**严禁**在 fileOrganization 中使用 JSON 对象、数组或嵌套结构！只能是纯文本字符串！

使用中文回复，只返回 JSON。
"#,
        project_name = req.project_name,
        project_path = req.project_path,
        status = status_display,
        tree = tree_text,
    )
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
    let system_prompt = build_file_org_prompt(req);
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
