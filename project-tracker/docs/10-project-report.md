# Project Tracker — 项目综合报告

> 撰写日期：2026-07-25  
> 最后更新：2026-07-28  
> 面向读者：后续开发者、维护者

---

## 一、项目概览

### 1.1 定位

**Project Tracker** 是一个基于 Tauri v2 的桌面端项目管理工具。核心价值主张：

- 以**思维导图**形式可视化项目目录结构
- 集成 **AI 分析**和**对话**能力，智能辅助项目决策
- 本地优先，数据完全存储在用户设备上

### 1.2 技术栈

| 层 | 技术 | 版本 |
|----|------|------|
| 桌面框架 | Tauri | v2 |
| 后端语言 | Rust | 1.79+ |
| 前端框架 | React | 19.x |
| 前端语言 | TypeScript | strict 模式 |
| 构建工具 | Vite | — |
| UI 组件 | shadcn/ui v4 | base-nova, @base-ui/react |
| 样式 | Tailwind CSS | v3 |
| 流程图 | React Flow | v11 (reactflow) |
| 状态管理 | Zustand | v5 |
| 图布局 | ELK | v0.11 |
| AI 通信 | reqwest (Rust SSE) | v0.12 |

### 1.3 平台支持

- Windows（主要开发平台）
- macOS / Linux（理论支持，未测试）

---

## 二、技术架构

### 2.1 目录结构

```
project-tracker/
├── src/                              # React 前端
│   ├── main.tsx                      # 入口：挂载 React 应用
│   ├── App.tsx                       # 根组件：布局、路由、全部业务逻辑
│   ├── App.css                       # 全局样式（含暗色模式变量）
│   ├── components/
│   │   ├── ui/                       # shadcn/ui 组件（button, dialog, select, …）
│   │   ├── SettingsPage.tsx          # 设置页面（分类导航 + AI 提示词编辑）
│   │   ├── ChatPanel.tsx             # AI 对话面板（流式聊天）
│   │   ├── HiddenFilesDialog.tsx     # 隐藏文件管理对话框
│   │   ├── NodeContextMenu.tsx       # 思维导图节点右键菜单
│   │   ├── MarkdownRenderer.tsx      # Markdown → JSX 渲染器
│   │   └── ErrorBoundary.tsx         # React 错误边界（防白屏）
│   ├── lib/
│   │   ├── ai.ts                     # AI 前端 API（分析 / 对话 / 流式）
│   │   ├── persistence.ts            # 数据持久化（配置 / 业务 / 缓存分离）
│   │   ├── layoutMindMap.ts          # ELK 布局引擎集成
│   │   ├── fingerprint.ts            # 目录变更检测指纹
│   │   ├── filterRules.ts            # 文件过滤规则
│   │   ├── logger.ts                 # 前端日志（console → Rust log）
│   │   └── utils.ts                  # cn() 合并类名
│   ├── store/
│   │   └── useAppStore.ts            # Zustand 全局状态
│   ├── hooks/
│   │   ├── useTheme.ts              # 主题切换 hook
│   │   ├── usePanelResize.ts        # 水平面板拖拽缩放
│   │   └── useVerticalResize.ts     # 垂直面板拖拽缩放
│   └── types/
│       ├── directory.ts              # DirNode 类型
│       └── project.ts               # Project 类型
│
├── src-tauri/                        # Rust 后端
│   ├── src/
│   │   ├── main.rs                   # 二进制入口
│   │   ├── lib.rs                    # Tauri Builder + 命令注册
│   │   ├── models/
│   │   │   ├── ai.rs                 # AI 请求/响应结构体
│   │   │   └── directory.rs          # DirNode, LogEntry
│   │   ├── services/
│   │   │   ├── ai_client.rs          # AI 核心逻辑（~1700 行）
│   │   │   └── data_files.rs         # 通用文件 I/O（原子读写、路径解析）
│   │   ├── commands/
│   │   │   ├── ai.rs                 # AI 相关 Tauri 命令
│   │   │   ├── crypto.rs             # AES-GCM 加密/解密命令
│   │   │   ├── data.rs               # 数据读写/导出/清缓存命令
│   │   │   ├── directory.rs          # 目录扫描命令
│   │   │   └── system.rs             # 系统级命令（打开目录、日志等）
│   │   └── utils/
│   │       └── logger.rs             # 日志系统（日期轮转）
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── docs/                             # 文档
│   ├── 01-tauri-frontend-api.md
│   ├── 02-tauri-backend-command.md
│   ├── 03-react-flow-v11-api.md
│   ├── 04-zustand-v5-api.md
│   ├── 05-elkjs-api.md
│   ├── 06-shadcn-ui-components.md
│   ├── 07-2026-AI-API-interface-condition.md
│   ├── 08-rust-backend-principles.md
│   ├── 09-data-management-principles.md
│   └── 10-project-report.md          # 本报告
│
├── .env                              # 环境变量（开发用，发布版不含）
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── components.json
```

### 2.2 Rust 后端分层（遵循 08 号文档）

```
models/      数据模型 — 纯数据结构，无业务逻辑
services/    业务逻辑 — AI 调用、文件 I/O、加密
commands/    Tauri 命令 — 薄封装，参数转换后委托 service
utils/       工具 — 日志等基础设施
```

**命令注册**：全部在 `lib.rs:generate_handler![]` 中显式声明。

### 2.3 数据流（IPC）

```
React 组件 → invoke('command', {args}) → Tauri IPC
  → #[tauri::command] → services → models
  → 返回 Result<T, String>（T 自动序列化为 JSON）
```

---

## 三、功能清单

### 3.1 项目管理

| 功能 | 状态 | 说明 |
|------|------|------|
| 添加项目 | ✅ | 通过系统目录选择器 |
| 切换项目 | ✅ | 自动保存/恢复视图快照 |
| 删除项目 | ✅ | 从列表中移除（不删除磁盘文件） |
| 目录扫描 | ✅ | 可配置深度 0-5，自动跳过 `.` 开头的隐藏目录 |
| 思维导图 | ✅ | React Flow + ELK 自动布局，支持折叠/展开 |
| 节点右键菜单 | ✅ | 隐藏/显示文件 |
| 隐藏文件管理 | ✅ | 对话框管理已隐藏文件列表 |

### 3.2 AI 对话

| 功能 | 状态 | 说明 |
|------|------|------|
| 流式 SSE 聊天 | ✅ | 实时显示 AI 回复 |
| 3 层提示词 | ✅ | L1 硬编码兜底 → L2 全局设置 → L3 项目规则 |
| 变量替换 | ✅ | `{tree}` `{projectName}` 等 6 个变量自动填充 |
| 对话历史 | ✅ | 按项目存储，支持多轮上下文 |
| 提示词编辑器 | ✅ | 设置页 95% 宽 textarea + 变量插入按钮 + 默认模板 |

### 3.3 AI 分析（并行双调用）

| 功能 | 状态 | 说明 |
|------|------|------|
| 核心分析 | ✅ | 并行调用 1：summary + suggestedNextSteps + structureInsights + risks |
| 文件整理方案 | ✅ | 并行调用 2：ASCII 树形图，max_tokens=8192 |
| 并行加载动画 | ✅ | 两个分析各自独立 spinner，先完成先展示 |
| 历史记录 | ✅ | 时间轴 / 下拉两种查看模式 |

### 3.4 AI 防护体系

| 防线 | 位置 | 机制 |
|------|------|------|
| 前端校验 | SettingsPage | 5 条规则实时验证（{tree}、JSON 指令、≥2 字段、≥40 字符、括号配对），不通过拒绝保存 |
| 后端校验 | ai_client.rs | 发送前二次校验，不合格自动降级到 L1 |
| 容错解析 1 | extract_balanced_json | 括号深度追踪截取完整 JSON |
| 容错解析 2 | to_string_list | 数组字段兼容对象/字符串/数组三种格式 |
| 容错解析 3 | parse_*_fallback | 逐字段手动提取，多 key 名兼容 |
| AI 原始存档 | ai_debug/ | 每次分析先写盘再解析，故障时可查原始返回 |

### 3.5 设置页

| 功能 | 状态 |
|------|------|
| 主题切换（浅色/深色/跟随系统） | ✅ |
| 数据存储路径（自定义 + 打开目录） | ✅ |
| 默认导图深度 | ✅ |
| 节点间距滑块 | ✅ |
| 下一步预设词条管理 | ✅ |
| API Key（密码输入 + 落盘加密） | ✅ |
| API 端点 | ✅ |
| 模型名称 | ✅ |
| 连接测试 | ✅ |
| AI 对话提示词编辑器（L2） | ✅ |
| AI 分析提示词编辑器（L2） | ✅ |
| 历史记录呈现方式 | ✅ |
| 兜底提示词提醒开关 | ✅ |
| 清理缓存 | ✅ |
| 导出全部数据 | ✅ |
| 语言切换 | ⏳ 暂未开放 |

### 3.6 数据管理

| 功能 | 状态 |
|------|------|
| 配置持久化（tauri-plugin-store） | ✅ |
| 业务数据持久化（projects.json） | ✅ |
| 缓存持久化（snapshots.json） | ✅ |
| 原子写入（.tmp → rename） | ✅ |
| 防抖自动保存（500ms） | ✅ |
| 启动时状态恢复 | ✅ |
| 项目快照（切换时保存/恢复视图） | ✅ |
| 目录变更检测（指纹比对 + 橙色圆点提醒） | ✅ |
| API Key 落盘加密（AES-256-GCM） | ✅ |
| 日志日期轮转 | ✅ |
| 旧格式自动迁移（app-state.json → 新结构） | ✅ |
| ErrorBoundary 白屏防护（5 个边界） | ✅ |
| GPL v3 开源许可 | ✅ |
| TypeScript 严格模式零错误 | ✅ |

---

## 四、数据管理

### 4.1 存储位置（按 09 号文档规范）

| 数据分类 | 存储位置 | 文件 | 格式 |
|----------|---------|------|------|
| 配置 | `%APPDATA%/com.boyua.project-tracker/` | `app-state.json` | tauri-plugin-store |
| 业务 | `{用户指定数据目录}/` | `projects.json` | 原子写入 JSON |
| 模板 | `{用户指定数据目录}/` | `prompts.json` | 原子写入 JSON |
| 缓存 | `{用户指定数据目录}/.project-tracker/cache/` | `snapshots.json`, `ai_debug/*.json` | 原子写入 JSON |
| 日志 | `%APPDATA%/com.boyua.project-tracker/log/` | `app_YYYY-MM-DD.log` | 日期轮转文本 |

### 4.2 数据优先级

- **用户指定数据目录** > 系统默认 `%APPDATA%`
- 设置页面 `dataPath` 为空时使用默认路径
- 所有业务/模板/缓存数据跟随 `dataPath`

### 4.3 API Key 加密方案

```
密钥派生：
  AES-256 Key = SHA-256(USERNAME@COMPUTERNAME:project-tracker-kdf-v1)

存储格式：
  enc:v1:<base64(12字节随机nonce + AES-256-GCM密文)>

特性：
  - 密钥绑定本机用户+机器名，换机无法解密
  - 每次加密使用随机 nonce，相同明文产生不同密文
  - 兼容旧明文：无 enc:v1: 前缀的数据直接当明文读取
  - 内存中始终明文，仅供运行时使用

依赖：aes-gcm, base64, sha2, getrandom（Rust）
位置：src-tauri/src/commands/crypto.rs
```

---

## 五、AI 子系统详解

### 5.1 3 层提示词架构

```
Layer 3（项目级）
  {项目目录}/.project-tracker/prompt.json → projectRules 字段
  若存在则追加到基础 prompt 末尾
          ↑
Layer 2（全局级）
  {dataDir}/prompts.json → system_prompt / analysis_prompt
  用户在设置页编辑，带校验
          ↑
Layer 1（兜底）
  Rust 硬编码模板，始终可用
```

解析优先级：L3 追加到 L2 > L2 > L1

### 5.2 分析调用流程

```
用户触发 "AI 分析"
  ├── Promise.all([
  │     analyze_project_core()    → max_tokens=2048  返回 summary + nextSteps + insights + risks
  │     analyze_project_file_org() → max_tokens=8192  返回 fileOrganization 树形文本
  │   ])
  ├── 各自独立 .then() 更新局部状态
  ├── 前端分段展示：哪个先完成先展示哪个
  └── 全部完成后存入历史记录
```

### 5.3 容错解析链

```
AI 返回文本
  → extract_json_from_text()
    → 优先匹配 ```json``` 代码块
    → extract_balanced_json() 括号深度追踪
  → serde 标准反序列化
    → 成功：直接返回
    → 失败：parse_*_fallback()
      → 逐字段手动提取
      → to_string_list() 处理类型变化（字符串/对象→数组）
      → 多 key 名兼容（camelCase/snake_case 变体）
      → 失败：返回兜底值，不抛错
```

### 5.4 AI 配置解析

```
优先级：设置值 > .env > 内置默认值

AiConfig::from_env_with(api_key, endpoint, model)
  ├─ api_key 非空 → 使用；否则 → AI_API_KEY 环境变量
  ├─ endpoint 非空 → 使用；否则 → AI_API_ENDPOINT 环境变量
  │   └─ 环境变量也为空 → "https://api.openai.com/v1/chat/completions"
  ├─ model 非空 → 使用；否则 → AI_MODEL 环境变量
  │   └─ 环境变量也为空 → "gpt-4o"
  └─ 自动识别 Anthropic 原生格式（endpoint 含 anthropic.com 且以 /v1/messages 结尾）
```

### 5.5 支持的 API 格式

- **OpenAI 兼容**：Bearer Authorization，`/v1/chat/completions`
- **Anthropic 原生**：x-api-key，`/v1/messages`，system prompt 放顶层而非 messages
- 自动识别并切换格式

---

## 六、安全与隐私

### 6.1 API Key 保护

| 环节 | 措施 |
|------|------|
| UI 输入 | `type="password"` 掩码 |
| 内存存储 | Zustand store 明文（仅运行时） |
| 磁盘存储 | AES-256-GCM 加密，`enc:v1:` 前缀 |
| 日志 | 只记录 `keyLen`，不记录内容 |
| 设置变更日志 | `updateSettings` 过滤 `apiKey` 不输出到 console |

### 6.2 数据传输

- 前端 → Rust IPC：纯内存，不落盘
- Rust → AI 服务：HTTPS（reqwest 默认 TLS）
- AI 响应存档：`ai_debug/` 目录，用户可控

### 6.3 依赖安全

- 所有 Rust 依赖从 crates.io 获取
- 加密使用标准库：aes-gcm, sha2, getrandom
- 前端依赖通过 pnpm 管理

---

## 七、已知限制与技术债务

### 7.1 未完成功能

| 项目 | 优先级 | 备注 |
|------|--------|------|
| `.gitignore` 规则解析 | 中 | 目录扫描不读取 gitignore |
| 语言切换 | 低 | 设置页"暂未开放"，发布前不做 |
| `node_modules` 默认过滤 | 低 | 用户可手动隐藏 |

### 7.2 近期已完成（07-25 → 07-28）

| 项目 | 日期 | 说明 |
|------|------|------|
| Rust panic 消除 | 07-26 | 全仓 0 处裸 `unwrap()`/`expect()`，1 处改为 `if let Err` + `eprintln!` 优雅退出 |
| `useProjectStats` 引用稳定性 | 07-26 | `EMPTY_STATS` 冻结常量 + `useShallow` + 拍平返回值，彻底消除不必要的重渲染 |
| ErrorBoundary 防线 | 07-26 | 5 个独立边界包裹关键 UI 区域，单组件崩溃不再导致整页白屏 |
| TypeScript 类型检查 | 07-26 | `npx tsc --noEmit` 零错误，零 `@ts-ignore`/`@ts-expect-error`/`as any` |
| Git 管理规范化 | 07-27 | 双层仓库拓扑文档化，统一 .gitignore，CLAUDE.md 迁至外层 |
| GPL v3 许可 | 07-27 | LICENSE 文件 + 36 个源文件头部声明 + README 许可章节 |
| README 重写 | 07-27 | 从极简 → 痛点说明 + 五大功能分类 + 完整项目结构 |
| CLAUDE.md 修复 | 07-27 | 内层内容迁入外层（恢复会话自动加载），追加 Git 管理约定

### 7.3 代码质量问题

| 问题 | 位置 | 影响 |
|------|------|------|
| `App.tsx` 过于庞大 | `src/App.tsx`（~2000 行） | 包含主布局+DetailPanel+10+子组件，应拆分 |
| `ai_client.rs` 过长 | `src-tauri/src/services/ai_client.rs`（~1700 行） | 可拆分为 prompt.rs / chat.rs / analysis.rs |
| 测试缺失 | 全局 | 无单元测试、无集成测试 |
| 前端状态分散 | App.tsx 大量 useState + Zustand | 部分局部状态应迁入 store |
| macOS/Linux 未测试 | 全局 | 仅在 Windows 11 上开发测试 |

### 7.4 架构限制

- **分析提示词 L2 仅支持核心分析**：文件整理方案使用独立硬编码提示词，未来可考虑支持 L2 自定义
- **AI 模型兼容性**：依赖模型按 JSON 格式输出，部分小模型（如 flash 版本）可能不遵从
- **单窗口**：不支持多窗口或标签页

---

## 八、后续优化方向

### 8.1 短期（稳定性和体验）

1. **拆分 App.tsx** — 将 AiAnalysisContent, AiResultCard, CoreResultCard 等提取为独立组件文件
2. **拆分 ai_client.rs** — 按功能拆为 ai_chat.rs, ai_analysis.rs, ai_prompt.rs
3. ~~修复 useProjectStats~~ ✅ 已完成 — 添加了 `EMPTY_STATS` 常量 + `useShallow` + 拍平原语字段，消除引用抖动
4. ~~添加错误边界~~ ✅ 已完成 — 5 个独立 ErrorBoundary 包裹 AI 面板、思维导图、对话、项目列表、设置页
5. **AI 模型预设列表** — 设置页模型输入改为带建议的下拉框

### 8.2 中期（功能和覆盖）

6. **`.gitignore` 解析** — 扫描时读取 gitignore 自动隐藏文件
7. **文件整理方案 L2 支持** — 文件整理也支持用户自定义提示词
8. **流式分析结果** — 分析结果支持流式输出（当前为非流式）
9. **节点模块过滤** — 默认隐藏 `node_modules` 等常见噪声目录
10. **分析结果导出** — 支持将 AI 分析结果导出为 Markdown/PDF

### 8.3 长期（质量和生态）

11. **单元测试** — Rust 端 service 层测试，前端组件测试
12. **E2E 测试** — Tauri 端到端测试
13. **CI/CD** — GitHub Actions 自动化构建和发布
14. **多语言支持** — i18n 框架集成
15. **插件系统** — 支持自定义分析和过滤插件

---

## 附录

### A. 环境变量（`.env`）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AI_API_KEY` | API 密钥 | — |
| `AI_API_ENDPOINT` | API 端点 | `https://api.openai.com/v1/chat/completions` |
| `AI_MODEL` | 模型名称 | `gpt-4o` |

设置页面的值优先级高于环境变量。

### B. 命令速查

```bash
pnpm install          # 安装依赖
pnpm tauri dev        # 开发模式（热更新）
pnpm tauri build      # 发布构建
npx tsc --noEmit      # 前端类型检查
cargo check           # Rust 编译检查（在 src-tauri/ 下）
```

### C. 关键依赖版本

| 包 | 版本 | 注意事项 |
|----|------|---------|
| `@tauri-apps/api` | 2.11.1 | `invoke` from `@tauri-apps/api/core` |
| `reactflow` | 11.11.4 | v11 API，不是 `@xyflow/react` v12 |
| `zustand` | 5.0.14 | `create<T>()()` 双括号语法 |
| `tauri-plugin-store` | 2.4.3 | `Builder::new().build()` 初始化 |
| `shadcn` | 4.13.0 | @base-ui/react 底层 |
| `tailwindcss` | 3.4.19 | v3，非 v4 |
| `elkjs` | 0.11.1 | `new ELK().layout(graph)` |
| `aes-gcm` | 0.11 | 加密依赖 |

### D. 外部文档参考

- [Tauri v2 文档](https://v2.tauri.app/)
- [React Flow v11 文档](https://v11.reactflow.dev/)
- [Zustand v5 文档](https://zustand.docs.pmnd.rs/)
- [shadcn/ui 文档](https://ui.shadcn.com/)
