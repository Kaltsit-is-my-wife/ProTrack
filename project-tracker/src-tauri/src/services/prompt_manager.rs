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

use std::collections::HashSet;
use std::path::PathBuf;

use crate::models::ai::{AnalyzeRequest, ChatRequest, SystemPromptData};
use crate::utils::logger::{Level, Logger};

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
    data.last_modified = crate::services::ai_client::chrono_iso_now();
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
    data.last_modified = crate::services::ai_client::chrono_iso_now();
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
    let mut matched = HashSet::new();
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
        "last_modified": crate::services::ai_client::chrono_iso_now(),
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

