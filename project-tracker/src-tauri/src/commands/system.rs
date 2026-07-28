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
use tauri::Manager;

use crate::models::directory::LogEntry;
use crate::models::error::AppError;
use crate::utils::logger::Level;

// ============================================================
// open_in_explorer — 跨平台在文件管理器中打开目录
// ============================================================

#[tauri::command]
pub fn open_in_explorer(
    path: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), AppError> {
    logger_state.write(
        Level::Info,
        "Explorer",
        &format!("open_in_explorer | path: {}", path),
    );
    let path = Path::new(&path);

    if !path.exists() {
        logger_state.write(
            Level::Warn,
            "Explorer",
            &format!("path not found: {}", path.display()),
        );
        return Err(AppError::system_error(format!("路径不存在: {}", path.display())));
    }

    #[cfg(target_os = "windows")]
    {
        let target = if path.is_file() {
            format!("/select,{}", path.display())
        } else {
            path.display().to_string()
        };
        std::process::Command::new("explorer")
            .arg(target)
            .spawn()
            .map_err(|e| AppError::system_error(format!("无法打开资源管理器: {}", e)))?;
    }

    #[cfg(target_os = "macos")]
    {
        let target = if path.is_file() {
            path.parent().unwrap_or(path)
        } else {
            path
        };
        std::process::Command::new("open")
            .arg(target)
            .spawn()
            .map_err(|e| AppError::system_error(format!("无法打开 Finder: {}", e)))?;
    }

    #[cfg(target_os = "linux")]
    {
        let target = if path.is_file() {
            path.parent().unwrap_or(path)
        } else {
            path
        };
        std::process::Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| AppError::system_error(format!("无法打开文件管理器: {}", e)))?;
    }

    Ok(())
}

// ============================================================
// log_message — 前端日志写入文件
// ============================================================

#[tauri::command]
pub fn log_message(
    entry: LogEntry,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), AppError> {
    let level = match entry.level.as_str() {
        "debug" => Level::Debug,
        "info" => Level::Info,
        "warn" => Level::Warn,
        "error" => Level::Error,
        _ => Level::Info,
    };
    logger_state.write(level, &entry.source, &entry.message);
    Ok(())
}

// ============================================================
// get_data_dir — 返回应用数据目录（配置 + 日志存储位置）
// ============================================================

#[tauri::command]
pub fn get_data_dir(app_handle: tauri::AppHandle) -> Result<String, AppError> {
    app_handle
        .path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| AppError::system_error(format!("无法获取应用数据目录: {}", e)))
}

// ============================================================
// greet（保留，用于测试 IPC 通道）
// ============================================================

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
