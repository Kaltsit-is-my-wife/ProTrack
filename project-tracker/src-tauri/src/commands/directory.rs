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

use std::path::Path;

use crate::models::directory::DirNode;
use crate::models::error::AppError;
use crate::utils::logger::Level;

// ============================================================
// 内置默认排除规则（始终生效，与用户自定义规则合并）
// ============================================================

const DEFAULT_IGNORE_RULES: &[&str] = &[
    "# 构建产物",
    "node_modules/",
    "dist/",
    "target/",
    "build/",
    "out/",
    ".next/",
    ".nuxt/",
    "# 版本控制",
    ".git/",
    ".svn/",
    "# Python",
    "__pycache__/",
    "*.pyc",
    ".venv/",
    "venv/",
    "# IDE",
    ".idea/",
    ".vscode/",
    "# 系统",
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
    "# 日志",
    "*.log",
    "logs/",
];

/// 获取内置默认排除规则（纯规则行，不含注释和空行）
pub fn get_default_ignore_rules() -> Vec<String> {
    DEFAULT_IGNORE_RULES
        .iter()
        .filter(|l| !l.starts_with('#') && !l.trim().is_empty())
        .map(|l| l.to_string())
        .collect()
}

// ============================================================
// 规则匹配逻辑
// ============================================================

/// 判断文件/目录是否被忽略
fn is_ignored(name: &str, is_dir: bool, rules: &[String]) -> bool {
    for rule in rules {
        let rule = rule.trim();
        if rule.is_empty() || rule.starts_with('#') {
            continue;
        }
        if matches_rule(name, is_dir, rule) {
            return true;
        }
    }
    false
}

fn matches_rule(name: &str, is_dir: bool, rule: &str) -> bool {
    // "dirname/" → 仅匹配同名目录
    if let Some(dir_name) = rule.strip_suffix('/') {
        return is_dir && name == dir_name;
    }
    // "*.ext" → 匹配后缀
    if let Some(ext) = rule.strip_prefix('*') {
        return name.ends_with(ext);
    }
    // 精确匹配
    name == rule
}

// ============================================================
// 加载 / 保存项目排除规则
// ============================================================

/// 加载项目排除规则（合并：内置默认 + 用户自定义）
#[tauri::command]
pub fn load_ignore_rules(
    project_path: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<Vec<String>, AppError> {
    let mut rules = get_default_ignore_rules();

    let path = Path::new(&project_path).join(".project-tracker").join("ignore");
    if path.exists() {
        let content = std::fs::read_to_string(&path)
            .map_err(|e| AppError::io_error(format!("读取忽略规则失败: {}", e)))?;
        for line in content.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() && !trimmed.starts_with('#') {
                rules.push(trimmed.to_string());
            }
        }
        logger_state.write(Level::Info, "Ignore", "合并规则已加载（默认 + 自定义）");
    }

    Ok(rules)
}

/// 保存用户自定义排除规则到 .project-tracker/ignore
#[tauri::command]
pub fn save_ignore_rules(
    project_path: String,
    rules: Vec<String>,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), AppError> {
    let dir = Path::new(&project_path).join(".project-tracker");
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| AppError::io_error(format!("创建 .project-tracker 失败: {}", e)))?;
    }

    let path = dir.join("ignore");
    // 过滤掉内置默认规则和注释/空行
    let defaults = get_default_ignore_rules();
    let custom: Vec<&str> = rules
        .iter()
        .map(|r| r.trim())
        .filter(|r| !r.is_empty() && !r.starts_with('#') && !defaults.contains(&r.to_string()))
        .collect();

    let content = if custom.is_empty() {
        String::new()
    } else {
        let mut s = String::from("# Project Tracker — 项目排除规则\n");
        s.push_str("# 语法类似 .gitignore：dirname/ 排除目录、*.ext 排除后缀、name 精确匹配\n");
        s.push('\n');
        for r in &custom {
            s.push_str(r);
            s.push('\n');
        }
        s
    };

    std::fs::write(&path, &content)
        .map_err(|e| AppError::io_error(format!("保存忽略规则失败: {}", e)))?;

    logger_state.write(Level::Info, "Ignore", &format!("自定义规则已保存 ({} 条)", custom.len()));
    Ok(())
}

// ============================================================
// scan_directory — 递归扫描目录并返回树形结构
// ============================================================

#[tauri::command]
pub fn scan_directory(
    path: String,
    max_depth: u32,
    ignore_rules: Vec<String>,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<DirNode, AppError> {
    logger_state.write(
        Level::Info,
        "Scan",
        &format!(
            "scan_directory called | path: {} | maxDepth: {} | ignoreRules: {}",
            path, max_depth, ignore_rules.len()
        ),
    );

    let root_path = Path::new(&path);

    if !root_path.exists() {
        logger_state.write(Level::Error, "Scan", &format!("path not found: {}", path));
        return Err(AppError::directory_not_found(path));
    }
    if !root_path.is_dir() {
        logger_state.write(
            Level::Error,
            "Scan",
            &format!("path is not a directory: {}", path),
        );
        return Err(AppError::directory_scan_failed("路径不是目录"));
    }

    let root_name = root_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let t0 = std::time::Instant::now();
    let result = build_subtree(root_path, &root_name, &path, 0, max_depth, &ignore_rules);
    logger_state.write(
        Level::Info,
        "Scan",
        &format!(
            "scan_directory done | children: {} | elapsed: {}ms",
            result.children.len(),
            t0.elapsed().as_millis()
        ),
    );

    Ok(result)
}

/// 递归构建子树
fn build_subtree(
    dir: &Path,
    name: &str,
    full_path: &str,
    depth: u32,
    max_depth: u32,
    ignore_rules: &[String],
) -> DirNode {
    let mut children: Vec<DirNode> = Vec::new();

    if depth < max_depth {
        if let Ok(entries) = std::fs::read_dir(dir) {
            let mut items: Vec<_> = entries.filter_map(|e| e.ok()).collect();
            items.sort_by_key(|e| {
                let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
                (!is_dir, e.file_name())
            });

            for entry in items {
                let child_name = entry.file_name().to_string_lossy().to_string();

                // 跳过隐藏文件/目录（以 . 开头）
                if child_name.starts_with('.') {
                    continue;
                }

                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

                // 应用排除规则
                if is_ignored(&child_name, is_dir, ignore_rules) {
                    continue;
                }

                let child_path = entry.path();
                let child_full = child_path.to_string_lossy().to_string();

                if is_dir {
                    children.push(build_subtree(
                        &child_path,
                        &child_name,
                        &child_full,
                        depth + 1,
                        max_depth,
                        ignore_rules,
                    ));
                } else {
                    let modified_at = entry
                        .metadata()
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as u64);
                    children.push(DirNode {
                        name: child_name,
                        path: child_full,
                        is_dir: false,
                        modified_at,
                        children: vec![],
                    });
                }
            }
        }
    }

    DirNode {
        name: name.to_string(),
        path: full_path.to_string(),
        is_dir: true,
        modified_at: None,
        children,
    }
}

// ============================================================
// ensure_project_tracker_dir — 确保项目目录下存在 .project-tracker/
// ============================================================

#[tauri::command]
pub fn ensure_project_tracker_dir(
    project_path: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), AppError> {
    let root = Path::new(&project_path);
    if !root.exists() || !root.is_dir() {
        logger_state.write(
            Level::Warn,
            "ProjectTracker",
            &format!("ensure_project_tracker_dir | 路径无效: {}", project_path),
        );
        return Err(AppError::directory_not_found(project_path));
    }

    let dir = root.join(".project-tracker");
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| AppError::io_error(format!("创建 .project-tracker 失败: {}", e)))?;

        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("attrib")
                .arg("+h")
                .arg(dir.as_os_str())
                .output();
        }

        logger_state.write(
            Level::Info,
            "ProjectTracker",
            &format!(".project-tracker 目录已创建: {}", dir.display()),
        );
    }
    Ok(())
}
