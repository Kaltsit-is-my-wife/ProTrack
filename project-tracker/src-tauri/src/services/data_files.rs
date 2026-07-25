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

use std::path::{Path, PathBuf};

use crate::utils::logger::{Level, Logger};

// ============================================================
// 通用 — 数据目录路径解析
// ============================================================

/// 解析数据文件路径：`{data_dir}/{filename}`
pub fn resolve_data_path(data_dir: &str, filename: &str) -> Result<PathBuf, String> {
    if data_dir.is_empty() {
        return Err("数据存储路径未设置".into());
    }
    let dir = Path::new(data_dir);
    std::fs::create_dir_all(dir)
        .map_err(|e| format!("创建数据目录失败: {}", e))?;
    Ok(dir.join(filename))
}

/// 解析缓存文件路径：`{data_dir}/.project-tracker/cache/{key}.json`
pub fn resolve_cache_path(data_dir: &str, key: &str) -> Result<PathBuf, String> {
    if data_dir.is_empty() {
        return Err("数据存储路径未设置".into());
    }
    let dir = Path::new(data_dir)
        .join(".project-tracker")
        .join("cache");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("创建缓存目录失败: {}", e))?;
    Ok(dir.join(format!("{}.json", key)))
}

// ============================================================
// 原子写入
// ============================================================

/// 将 JSON 字符串原子写入指定路径
pub fn atomic_write_json(path: &Path, json: &str, logger: &Logger) -> Result<(), String> {
    let tmp_path = path.with_extension("json.tmp");

    std::fs::write(&tmp_path, json)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;

    std::fs::rename(&tmp_path, path)
        .map_err(|e| format!("替换文件失败: {}", e))?;

    logger.write(
        Level::Info,
        "Data",
        &format!("文件已保存 | path: {} | size: {}B", path.display(), json.len()),
    );
    Ok(())
}

// ============================================================
// 读取
// ============================================================

/// 读取文件内容为字符串，若文件不存在返回 None
pub fn read_json_file(path: &Path, logger: &Logger) -> Result<Option<String>, String> {
    if !path.exists() {
        logger.write(
            Level::Debug,
            "Data",
            &format!("文件不存在: {}", path.display()),
        );
        return Ok(None);
    }

    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("读取文件失败: {}", e))?;

    logger.write(
        Level::Info,
        "Data",
        &format!("文件已加载 | path: {} | size: {}B", path.display(), content.len()),
    );
    Ok(Some(content))
}

// ============================================================
// 删除缓存
// ============================================================

// ============================================================
// AI 调试 — 原始响应存档
// ============================================================

/// 解析 AI 调试文件路径：`{data_dir}/.project-tracker/cache/ai_debug/{project_name}_{timestamp}.json`
pub fn resolve_ai_debug_path(data_dir: &str, project_name: &str) -> Result<PathBuf, String> {
    if data_dir.is_empty() {
        return Err("数据存储路径未设置".into());
    }
    let dir = Path::new(data_dir)
        .join(".project-tracker")
        .join("cache")
        .join("ai_debug");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("创建 AI 调试目录失败: {}", e))?;

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let safe_name: String = project_name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();

    Ok(dir.join(format!("{}_{}.json", safe_name, now_secs)))
}

// ============================================================
// 删除缓存
// ============================================================

// ============================================================
// 导出 — 合并所有数据文件到单个 JSON
// ============================================================

/// 导出全部数据到指定路径
pub fn export_all_data(data_dir: &str, target_path: &str, logger: &Logger) -> Result<(), String> {
    use serde_json::Value;

    let dir = Path::new(data_dir);

    // 读取主要数据文件
    let projects = read_json_file(&dir.join("projects.json"), logger)
        .unwrap_or(None)
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .unwrap_or(Value::Null);

    let prompts = read_json_file(&dir.join("prompts.json"), logger)
        .unwrap_or(None)
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .unwrap_or(Value::Null);

    let export = serde_json::json!({
        "version": "1.0",
        "exported_at": crate::services::ai_client::chrono_iso_now(),
        "data_dir": data_dir,
        "projects": projects,
        "prompts": prompts,
    });

    let json = serde_json::to_string_pretty(&export)
        .map_err(|e| format!("序列化导出数据失败: {}", e))?;

    let path = Path::new(target_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建导出目录失败: {}", e))?;
    }

    std::fs::write(path, &json)
        .map_err(|e| format!("写入导出文件失败: {}", e))?;

    logger.write(
        Level::Info,
        "Export",
        &format!("全部数据已导出 | path: {} | size: {}B", path.display(), json.len()),
    );
    Ok(())
}

// ============================================================
// 删除缓存
// ============================================================

/// 清空缓存目录
pub fn clear_cache(data_dir: &str, logger: &Logger) -> Result<(), String> {
    if data_dir.is_empty() {
        return Err("数据存储路径未设置".into());
    }
    let cache_dir = Path::new(data_dir)
        .join(".project-tracker")
        .join("cache");

    if cache_dir.exists() {
        std::fs::remove_dir_all(&cache_dir)
            .map_err(|e| format!("清空缓存失败: {}", e))?;
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("重建缓存目录失败: {}", e))?;
        logger.write(Level::Info, "Data", "缓存已清理");
    }
    Ok(())
}
