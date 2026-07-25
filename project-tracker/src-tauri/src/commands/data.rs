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
) -> Result<(), String> {
    let path = services::data_files::resolve_data_path(&data_dir, &filename)?;
    services::data_files::atomic_write_json(&path, &json, &logger_state)
}

// ============================================================
// load_data_file — 从数据目录加载 JSON
// ============================================================

#[tauri::command]
pub fn load_data_file(
    filename: String,
    data_dir: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<Option<String>, String> {
    let path = services::data_files::resolve_data_path(&data_dir, &filename)?;
    services::data_files::read_json_file(&path, &logger_state)
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
) -> Result<(), String> {
    let path = services::data_files::resolve_cache_path(&data_dir, &key)?;
    services::data_files::atomic_write_json(&path, &json, &logger_state)
}

// ============================================================
// load_cache — 从缓存目录加载 JSON
// ============================================================

#[tauri::command]
pub fn load_cache(
    key: String,
    data_dir: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<Option<String>, String> {
    let path = services::data_files::resolve_cache_path(&data_dir, &key)?;
    services::data_files::read_json_file(&path, &logger_state)
}

// ============================================================
// clear_cache — 清空缓存目录
// ============================================================

#[tauri::command]
pub fn clear_cache(
    data_dir: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), String> {
    services::data_files::clear_cache(&data_dir, &logger_state)
}

// ============================================================
// export_all_data — 导出全部数据到指定路径
// ============================================================

#[tauri::command]
pub fn export_all_data(
    data_dir: String,
    target_path: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), String> {
    services::data_files::export_all_data(&data_dir, &target_path, &logger_state)
}
