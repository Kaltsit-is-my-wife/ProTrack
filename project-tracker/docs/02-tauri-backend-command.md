# Tauri 2.0 后端 Command 参考

> **安装版本**: `tauri` v2.x (Cargo.toml)
> **官方文档**: https://v2.tauri.app/develop/calling-rust/

---

## 1. 定义命令

```rust
// src-tauri/src/lib.rs

#[tauri::command]
fn my_command(param: String) -> String {
    format!("Received: {}", param)
}
```

命令在 Builder 中注册：
```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            my_command,          // ← 注册新命令
            list_directory,      // ← 注册新命令
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 2. 参数类型规则

### 普通参数（需要前端传入）
必须实现 `serde::Deserialize`：

| Rust 类型 | 说明 |
|-----------|------|
| `String` | 字符串 |
| `i32`, `u32`, `f64` 等 | 数字 |
| `bool` | 布尔值 |
| `Vec<T>` | 数组 |
| `HashMap<K, V>` | 对象 |
| 自定义 `struct` (需 `#[derive(Deserialize)]`) | 复杂对象 |

### 特殊参数（框架自动注入，前端不需要传）

| 类型 | 说明 |
|------|------|
| `tauri::AppHandle` | 应用句柄，可访问全局状态、路径等 |
| `tauri::Window` | 当前窗口引用 |
| `tauri::WebviewWindow` | Webview 窗口引用 |
| `tauri::State<'_, T>` | 通过 `.manage()` 注入的全局状态 |

```rust
#[tauri::command]
async fn complex_operation(
    app: tauri::AppHandle,              // 自动注入
    window: tauri::Window,              // 自动注入
    state: tauri::State<'_, AppState>,  // 自动注入
    search_text: String,                // 前端传入
) -> Result<Vec<String>, String> {
    // ...
}
```

---

## 3. 返回类型规则

### 成功返回值
必须实现 `serde::Serialize`。

```rust
// 基本类型
#[tauri::command]
fn get_count() -> u32 { 42 }

// 自定义结构体
#[derive(serde::Serialize)]
struct DirEntry {
    name: String,
    is_dir: bool,
    path: String,
}

#[tauri::command]
fn list_files(dir: String) -> Vec<DirEntry> {
    // ...
}
```

### 错误处理 — `Result<T, E>`
```rust
#[tauri::command]
fn read_config() -> Result<Config, String> {
    if config_exists() {
        Ok(Config::load())
    } else {
        Err("Config not found".into())
    }
}
```

前端通过 `try/catch` 捕获：
```typescript
try {
    const config = await invoke('read_config');
} catch (error) {
    console.error(error); // "Config not found"
}
```

---

## 4. 状态管理 (`tauri::State`)

### 注入全局状态
```rust
use std::sync::Mutex;

struct AppState {
    project_paths: Mutex<Vec<String>>,
    settings: Mutex<Settings>,
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            project_paths: Mutex::new(Vec::new()),
            settings: Mutex::new(Settings::default()),
        })
        .invoke_handler(tauri::generate_handler![add_project])
        .run(tauri::generate_context!())
        .expect("error");
}
```

### 在命令中访问
```rust
#[tauri::command]
fn add_project(state: tauri::State<'_, AppState>, path: String) -> Result<(), String> {
    let mut paths = state.project_paths.lock().map_err(|e| e.to_string())?;
    paths.push(path);
    Ok(())
}
```

---

## 5. 异步命令

```rust
#[tauri::command]
async fn heavy_computation(data: String) -> Result<String, String> {
    // 在异步运行时中执行，不阻塞主线程
    tokio::task::spawn_blocking(move || {
        process_data(&data) // CPU 密集型操作
    })
    .await
    .map_err(|e| e.to_string())
}
```

**注意**: 异步命令不能使用借用类型（如 `&str`），必须使用 owned 类型（如 `String`）。

---

## 6. 命名约定

| 规则 | 示例 |
|------|------|
| 默认转换 | JS `camelCase` ↔ Rust `snake_case` |
| 自定义转换 | `#[tauri::command(rename_all = "snake_case")]` |

```rust
// JS 调用: invoke('get_project_info', { projectId: 1 })
// Rust: fn get_project_info(project_id: String)
#[tauri::command]
fn get_project_info(project_id: String) -> Result<ProjectInfo, String> {
    // project_id 自动从 projectId 映射
}
```

---

## 7. 二进制数据返回

绕过 JSON 序列化，直接返回二进制：
```rust
use tauri::ipc::Response;

#[tauri::command]
fn read_file(path: String) -> Result<Response, String> {
    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(Response::new(data))
}
```

---

## 8. 插件注册模板

```rust
pub fn run() {
    tauri::Builder::default()
        // Tauri 官方插件
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())  // ← 注意：v2.4.3+ 用 Builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        // 自定义命令
        .invoke_handler(tauri::generate_handler![
            greet,
            list_directory,
            add_project,
            get_project_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 9. 权限配置

在 `src-tauri/capabilities/default.json` 中声明：
```json
{
  "permissions": [
    "core:default",
    "store:default",
    "dialog:default",
    "shell:default"
  ]
}
```
