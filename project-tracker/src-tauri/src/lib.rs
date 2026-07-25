// ============================================================
// Project Tracker — 模块聚合导出
// ============================================================

pub mod commands;
pub mod models;
pub mod services;
pub mod utils;

use std::path::PathBuf;
use tauri::Manager;
use utils::logger::{Level, Logger};

// ============================================================
// Tauri Builder
// ============================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 日志落点 → 系统标准应用数据目录（%APPDATA% 等）
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("无法解析应用数据目录: {}", e))?;

            let app_logger = Logger::new(app_data_dir.clone());
            app_logger.write(
                Level::Info,
                "system",
                &format!(
                    "=== Project Tracker 启动 (log: {}) ===",
                    app_data_dir.join("log").display()
                ),
            );

            // 加载项目根目录的 .env 文件
            let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
            let project_root =
                services::ai_client::find_project_root().unwrap_or(cwd);
            let env_path = project_root.join(".env");
            if env_path.exists() {
                match dotenvy::from_path(&env_path) {
                    Ok(_) => app_logger.write(
                        Level::Info,
                        "system",
                        &format!(".env loaded: {}", env_path.display()),
                    ),
                    Err(e) => app_logger.write(
                        Level::Warn,
                        "system",
                        &format!(".env load failed: {}", e),
                    ),
                }
            }

            app.manage(app_logger);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::greet,
            commands::directory::scan_directory,
            commands::directory::ensure_project_tracker_dir,
            commands::system::open_in_explorer,
            commands::system::log_message,
            commands::system::get_data_dir,
            commands::ai::analyze_project_core,
            commands::ai::analyze_project_file_org,
            commands::ai::test_ai_connection,
            commands::ai::chat_with_ai,
            commands::ai::save_system_prompt,
            commands::ai::load_system_prompt,
            commands::ai::save_analysis_prompt,
            commands::ai::load_analysis_prompt,
            commands::ai::save_project_rules,
            commands::ai::load_project_rules,
            commands::data::save_data_file,
            commands::data::load_data_file,
            commands::data::save_cache,
            commands::data::load_cache,
            commands::data::clear_cache,
            commands::data::export_all_data,
            commands::crypto::encrypt_setting,
            commands::crypto::decrypt_setting,
        ])
        // run() 返回 Result<(), tauri::Error>
        .run(tauri::generate_context!());

    // 如果启动失败（窗口创建失败、插件初始化失败等），此时没有任何 UI 可以展示错误。
    // 走 stderr 输出诊断 → 干净退出（exit code 1），避免 Rust panic backtrace。
    if let Err(e) = app {
        eprintln!("Tauri 启动失败: {:#}", e);
        std::process::exit(1);
    }
}
