use std::path::Path;

use crate::models::directory::DirNode;
use crate::utils::logger::Level;

// ============================================================
// scan_directory — 递归扫描目录并返回树形结构
// ============================================================

#[tauri::command]
pub fn scan_directory(
    path: String,
    max_depth: u32,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<DirNode, String> {
    logger_state.write(
        Level::Info,
        "Scan",
        &format!(
            "scan_directory called | path: {} | maxDepth: {}",
            path, max_depth
        ),
    );

    let root_path = Path::new(&path);

    if !root_path.exists() {
        logger_state.write(Level::Error, "Scan", &format!("path not found: {}", path));
        return Err(format!("路径不存在: {}", path));
    }
    if !root_path.is_dir() {
        logger_state.write(
            Level::Error,
            "Scan",
            &format!("path is not a directory: {}", path),
        );
        return Err("路径不是目录".into());
    }

    let root_name = root_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let t0 = std::time::Instant::now();
    let result = build_subtree(root_path, &root_name, &path, 0, max_depth);
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
fn build_subtree(dir: &Path, name: &str, full_path: &str, depth: u32, max_depth: u32) -> DirNode {
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

                // 跳过隐藏文件/目录（以 . 开头），如 .git .github .vscode .env 等
                if child_name.starts_with('.') {
                    continue;
                }

                let child_path = entry.path();
                let child_full = child_path.to_string_lossy().to_string();
                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

                if is_dir {
                    children.push(build_subtree(
                        &child_path,
                        &child_name,
                        &child_full,
                        depth + 1,
                        max_depth,
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

/// 在项目根目录下创建 `.project-tracker/`（幂等）。
/// 调用时机：添加项目、切换项目、重启应用、扫描目录、AI 交互前等。
#[tauri::command]
pub fn ensure_project_tracker_dir(
    project_path: String,
    logger_state: tauri::State<'_, crate::utils::logger::Logger>,
) -> Result<(), String> {
    let root = Path::new(&project_path);
    if !root.exists() || !root.is_dir() {
        logger_state.write(
            Level::Warn,
            "ProjectTracker",
            &format!("ensure_project_tracker_dir | 路径无效: {}", project_path),
        );
        return Err(format!("路径不存在或不是目录: {}", project_path));
    }

    let dir = root.join(".project-tracker");
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("创建 .project-tracker 失败: {}", e))?;

        // Windows 上 . 开头的目录不会自动隐藏，需设置隐藏属性
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
