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

use crate::models::error::AppError;
use crate::services;

// ============================================================
// save_data_file — 保存 JSON 到数据目录
// ============================================================

#[tauri::command]
pub fn save_data_file(
    filename: String,
    data_dir: String,
    json: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), AppError> {
    let path = services::data_files::resolve_data_path(&data_dir, &filename)
        .map_err(|e| AppError::data_save_failed(e))?;
    services::data_files::atomic_write_json(&path, &json, &logger_state)
        .map_err(|e| AppError::data_save_failed(e))
}

// ============================================================
// load_data_file — 从数据目录加载 JSON
// ============================================================

#[tauri::command]
pub fn load_data_file(
    filename: String,
    data_dir: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<Option<String>, AppError> {
    let path = services::data_files::resolve_data_path(&data_dir, &filename)
        .map_err(|e| AppError::data_load_failed(e))?;
    services::data_files::read_json_file(&path, &logger_state)
        .map_err(|e| AppError::data_load_failed(e))
}

// ============================================================
// save_cache — 保存 JSON 到缓存目录
// ============================================================

#[tauri::command]
pub fn save_cache(
    key: String,
    data_dir: String,
    json: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), AppError> {
    let path = services::data_files::resolve_cache_path(&data_dir, &key)
        .map_err(|e| AppError::data_save_failed(e))?;
    services::data_files::atomic_write_json(&path, &json, &logger_state)
        .map_err(|e| AppError::data_save_failed(e))
}

// ============================================================
// load_cache — 从缓存目录加载 JSON
// ============================================================

#[tauri::command]
pub fn load_cache(
    key: String,
    data_dir: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<Option<String>, AppError> {
    let path = services::data_files::resolve_cache_path(&data_dir, &key)
        .map_err(|e| AppError::data_load_failed(e))?;
    services::data_files::read_json_file(&path, &logger_state)
        .map_err(|e| AppError::data_load_failed(e))
}

// ============================================================
// clear_cache — 清空缓存目录
// ============================================================

#[tauri::command]
pub fn clear_cache(
    data_dir: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), AppError> {
    services::data_files::clear_cache(&data_dir, &logger_state)
        .map_err(|e| AppError::cache_clear_failed(e))
}

// ============================================================
// export_all_data — 导出全部数据到指定路径
// ============================================================

#[tauri::command]
pub fn export_all_data(
    data_dir: String,
    target_path: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), AppError> {
    services::data_files::export_all_data(&data_dir, &target_path, &logger_state)
        .map_err(|e| AppError::data_export_failed(e))
}
