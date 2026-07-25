# Rust 后端目录拆分原则

## 一、目录结构

```
src-tauri/src/
├── main.rs              # 唯一入口：插件初始化 + 命令注册 + 窗口启动
├── lib.rs               # 公共模块聚合导出
├── commands/            # 所有 #[tauri::command] 函数
│   ├── mod.rs           # pub mod xxx; 统一暴露
│   ├── directory.rs     # 目录扫描命令
│   ├── store.rs         # 数据持久化命令
│   ├── ai.rs            # AI 调用命令（analyze_project, chat_with_ai）
│   └── system.rs        # 系统操作命令（打开资源管理器等）
├── models/              # 数据结构（serde Serialize/Deserialize）
│   ├── mod.rs
│   ├── directory.rs     # DirNode
│   ├── project.rs       # Project, AIAnalysis, Suggestion
│   └── ai.rs            # AIConfig, Prompts, ChatMessage
├── services/            # 纯业务逻辑，不直接暴露给前端
│   ├── mod.rs
│   ├── prompt_manager.rs # Prompt 三层管理（内置/全局/项目）
│   └── ai_client.rs     # 统一 HTTP 客户端，处理流式/非流式
└── utils/               # 通用工具函数
    ├── mod.rs
    └── logger.rs        # 日志相关
```

## 二、分层原则

### 2.1 命令层（commands/）

每个命令函数只做三件事：

```rust
#[tauri::command]
async fn xxx(...) -> Result<YYY, String> {
    // 1. 参数校验
    // 2. 调用 service 或 model
    // 3. 返回结果或错误
}
```

**禁止**：
- 命令函数超过 20 行（复杂逻辑抽 service）
- 在命令函数里直接写 HTTP 请求
- 在命令函数里直接读写文件
- 在命令函数里做复杂计算

### 2.2 服务层（services/）

纯业务逻辑，被 commands 调用：

```
commands/  →  调用  →  services/  +  models/
services/  →  调用  →  models/  +  外部库（reqwest, walkdir 等）
```

**禁止**：
- services 调用 commands（循环依赖）
- services 直接暴露给前端

### 2.3 模型层（models/）

纯数据结构，不依赖任何其他模块：

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct AIAnalysis {
    pub id: String,
    pub timestamp: u64,
    // ...
}
```

**禁止**：
- models 依赖 services/ 或 commands/（循环依赖）
- models 里写业务逻辑

### 2.4 工具层（utils/）

通用工具函数，任何层都可以调用：

```
utils/  →  不依赖任何其他模块
```

## 三、错误处理原则

所有 `Result<T, E>` 在命令层统一转成 `Result<T, String>`：

```rust
// service 层可以用自定义错误
pub enum AIError {
    Network(reqwest::Error),
    Parse(serde_json::Error),
    InvalidPrompt,
}

// command 层统一转 String
#[tauri::command]
async fn analyze(...) -> Result<AIAnalysis, String> {
    ai_client::analyze(...)
        .await
        .map_err(|e| e.to_string())
}
```

**禁止**：把 `reqwest::Error`、`io::Error` 等原始错误直接抛给前端。

## 四、Prompt 管理三层优先级

```
项目级  >  全局  >  内置默认
```

| 层级 | 存储位置 | 加载时机 |
|------|---------|---------|
| 内置默认 | 硬编码在 Rust 代码里 | 全局文件缺失时自动重建 |
| 全局 | `%APPDATA%/project-tracker/prompts.json` | 应用启动时加载 |
| 项目级 | `项目根目录/.project-tracker/prompts.json` | 切换项目时自动检查 |

**自动切换逻辑**：
- 切换项目 → 检查项目目录下是否有 prompts.json → 有则加载，无则回退到全局
- 全局缺失 → 用内置默认重建

## 五、AI 客户端统一入口

所有厂商 API（OpenAI、Anthropic、DeepSeek 等）走同一个 `ai_client.rs`：

```rust
pub async fn chat(
    config: &AIConfig,
    messages: Vec<ChatMessage>,
    stream: bool,
) -> Result<String, AIError>;

pub async fn analyze(
    config: &AIConfig,
    project_data: &ProjectData,
    prompt: &str,
) -> Result<AIAnalysis, AIError>;
```

**禁止**：
- 每个厂商写一个 client
- 在命令层直接调 reqwest

## 六、文件命名规范

| 类型 | 命名规范 | 示例 |
|------|---------|------|
| 命令文件 | `名词.rs` 或 `动词_名词.rs` | `ai.rs`, `directory.rs` |
| service 文件 | `名词_动词.rs` | `prompt_manager.rs`, `ai_client.rs` |
| model 文件 | `名词.rs` | `project.rs`, `directory.rs` |
| 结构体 | PascalCase | `AIAnalysis`, `PromptManager` |
| 函数/变量 | snake_case | `analyze_project`, `prompt_manager` |
| 常量 | SCREAMING_SNAKE_CASE | `DEFAULT_ANALYZE_PROMPT` |

## 七、main.rs 精简规范

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::Builder::new().build())
        .plugin(tauri_plugin_shell::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            // commands 层统一在这里注册
            commands::directory::scan_directory,
            commands::store::load_data,
            commands::store::save_data,
            commands::ai::analyze_project,
            commands::ai::chat_with_ai,
            commands::system::open_in_explorer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**禁止**：在 main.rs 里写业务逻辑、定义结构体、实现函数。

## 八、新增功能时的添加流程

1. **定义数据结构** → `models/` 新建或修改
2. **实现业务逻辑** → `services/` 新建或修改
3. **暴露命令接口** → `commands/` 新建或修改
4. **注册命令** → `main.rs` 的 `generate_handler!` 中添加
5. **更新 lib.rs** → 如有新增模块，在 `lib.rs` 中导出

## 九、验证 checklist

每次重构或新增功能后，确认：

- [ ] `pnpm tauri dev` 能正常编译运行
- [ ] 没有循环依赖（`cargo check` 通过）
- [ ] 命令层函数不超过 20 行（复杂逻辑已抽 service）
- [ ] 错误统一在命令层转成 String
- [ ] models/ 不依赖 services/ 或 commands/
- [ ] 新增命令已在 main.rs 注册
