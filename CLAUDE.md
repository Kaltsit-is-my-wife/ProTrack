# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project Tracker — a Tauri v2 desktop application with a React + TypeScript frontend and a Rust backend. Currently in early scaffold stage, transitioning to feature development.

## Commands

```bash
# Install dependencies
pnpm install

# Start Tauri dev mode (compiles Rust backend + starts Vite dev server on port 1420, opens desktop window)
pnpm tauri dev

# Frontend-only dev (Vite, no Rust/desktop — port 1420)
pnpm dev

# Type-check and build frontend
pnpm build

# Full release build (Rust + frontend + installer)
pnpm tauri build

# Add shadcn/ui component
npx shadcn@latest add <component-name>

# Add npm package
pnpm add <package>

# Add Rust crate (run from src-tauri/)
cd src-tauri && cargo add <crate>
```

## Version Quick Reference

| Package | Version | Key API Note |
|---------|---------|-------------|
| `@tauri-apps/api` | **2.11.1** | `invoke` from `@tauri-apps/api/core` (NOT `@tauri-apps/api/tauri`) |
| `reactflow` | **11.11.4** | v11 — NOT `@xyflow/react` v12. Docs at `v11.reactflow.dev` |
| `zustand` | **5.0.14** | v5 — requires `create<T>()()` double-parens syntax |
| `elkjs` | **0.11.1** | `new ELK().layout(graph)` |
| `shadcn` | **4.13.0** | base-nova style, uses `@base-ui/react` (NOT Radix) |
| `tailwindcss` | **3.4.19** | v3 with PostCSS (NOT v4 `@import` syntax) |
| `react` | **19.x** | |

## Architecture

```
project-tracker/
├── src/                     # React frontend (TypeScript)
│   ├── main.tsx             # Entry point, imports App.css, mounts <App />
│   ├── App.tsx              # Root component (Tauri IPC demo — to be replaced)
│   ├── App.css              # Global styles (shadcn CSS vars, dark mode, Geist font)
│   ├── components/ui/       # shadcn/ui components (11 installed)
│   │   ├── button.tsx       #   Based on @base-ui/react/button
│   │   ├── dialog.tsx       #   Based on @base-ui/react/dialog
│   │   ├── select.tsx       #   Based on @base-ui/react/select
│   │   ├── switch.tsx       #   Based on @base-ui/react/switch
│   │   ├── scroll-area.tsx  #   Based on @base-ui/react/scroll-area
│   │   ├── separator.tsx    #   Based on @base-ui/react/separator
│   │   ├── card.tsx         #   Pure div-based
│   │   ├── input.tsx        #   Native input wrapper
│   │   ├── label.tsx        #   Native label wrapper
│   │   ├── textarea.tsx     #   Native textarea wrapper
│   │   └── badge.tsx        #   Pure div-based
│   └── lib/utils.ts         # cn() helper (clsx + tailwind-merge)
├── src-tauri/               # Rust backend (Tauri)
│   ├── src/
│   │   ├── main.rs          # Binary entry: calls project_tracker_lib::run()
│   │   └── lib.rs           # Builder setup: plugins + commands
│   ├── Cargo.toml           # Rust deps (tauri, plugins, serde, serde_json)
│   ├── tauri.conf.json      # Window config, dev/build commands, CSP=null
│   ├── capabilities/default.json  # Permissions: core, opener, store, dialog, shell
│   └── icons/               # App icons
├── docs/                    # 📚 API reference docs for all major dependencies
│   ├── 01-tauri-frontend-api.md
│   ├── 02-tauri-backend-command.md
│   ├── 03-react-flow-v11-api.md
│   ├── 04-zustand-v5-api.md
│   ├── 05-elkjs-api.md
│   └── 06-shadcn-ui-components.md
├── index.html               # Vite entry HTML
├── vite.config.ts           # Vite config (port 1420, @/ path alias)
├── tailwind.config.js       # Tailwind v3 config (shadcn color mappings)
├── tailwindcss.config.js    # Incomplete config (possible remnant, verify before deleting)
├── postcss.config.js        # PostCSS with tailwindcss + autoprefixer
├── components.json          # shadcn v4 config (base-nova, neutral, lucide icons)
└── package.json             # Frontend scripts and dependencies
```

### Tauri Plugin Registration (lib.rs)

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_store::Builder::new().build())  // ⚠️ v2.4.3 uses Builder
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![greet])
    .run(tauri::generate_context!())
```

### IPC Pattern

- **Define** (Rust): `#[tauri::command]` in `lib.rs` → register in `generate_handler![]`
- **Call** (TypeScript): `import { invoke } from '@tauri-apps/api/core'` → `await invoke<T>('cmd', args)`
- **Permissions**: declare in `capabilities/default.json`

### Tailwind v3 + shadcn v4 Setup

- Tailwind v3 uses `@tailwind base/components/utilities` directives in CSS
- shadcn v4 uses `@base-ui/react` primitives (button, dialog, select, switch, scroll-area, separator)
- CSS variables defined in `App.css` under `:root` and `.dark` for theme switching
- `tailwind.config.js` maps CSS vars to Tailwind utility classes (e.g., `bg-primary`)

## Important Gotchas

1. **`@tauri-apps/api/tauri`** is v1 — always use **`@tauri-apps/api/core`** for `invoke` in v2
2. **`tauri_plugin_store::init()`** doesn't exist in v2.4.3 — use **`Builder::new().build()`**
3. **shadcn Components**: Some generated files have `import * as React` that may be unused — remove if TypeScript strict mode errors
4. **Zustand v5**: Must use `create<Store>()(fn)` double-parens syntax for TypeScript; use `useShallow` for multi-field selectors
5. **React Flow v11**: Use `parentId` (not `parentNode`), `reconnectable` (not `edgesUpdatable`), `screenToFlowPosition()` (not `project()`)
6. **ELK**: Must set `width`/`height` on nodes before layout; child coordinates are relative to parent
7. **tsconfig strict mode**: `noUnusedLocals: true` and `noUnusedParameters: true` are enabled — unused imports will fail `tsc`

## Development Roadmap

The `ready.md` file outlines the full product plan. For detailed API references, see the `docs/` directory.

## Git 仓库管理约定（请严格遵守，勿擅自变更结构）

拓扑：外层 projectTracker/ = Git 仓库根（.git 在此）= VS Code 工作区根 = cwd。内层 project-tracker/ = 实际代码（Tauri+Vite）。全仓库只有一份 .gitignore，在外层；内层禁止存在 .gitignore。本规范文档位于外层 CLAUDE.md（会话启动即加载）。

必须被忽略、绝不进 git：外层壳目录 .claude/、testRoaming/；以及 .env、node_modules/、dist/、dist-ssr/、src-tauri/target/、src-tauri/gen/、*.pem/*.key/*.p12/*.pfx、*.local。

DO：只改外层这一份 .gitignore；优先用无路径前缀模式（如 node_modules/，匹配任意层级罩住内层），需精确定位内层时用 project-tracker/... 相对前缀；改规则先于 git add，已追踪文件需先 git rm -r --cached；提交前用 git check-ignore -v <path> 验证（有输出=已忽略，无输出=危险）。

DON'T：❌ 在内层新建 .gitignore；❌ 写绝对路径；❌ 提交上述敏感/巨型路径；❌ 把 .git 挪到内层或在内层 init；❌ 用无斜杠的 log 宽匹配（应写 log/ 或 *.log）。

## Rust 后端开发规范（基于 docs/08-rust-backend-principles.md，每次写后端必须遵守）

### 分层架构

```
commands/  → 调用 → services/  +  models/
services/  → 调用 → models/  +  外部库
utils/     → 不依赖任何其他模块
models/    → 纯数据结构，不依赖 services/ 或 commands/
```

### 各层职责

**commands/** — 每个命令函数只做三件事：参数校验、调用 service、返回结果。禁止超过 20 行、直接写 HTTP 请求、直接读写文件。

**services/** — 纯业务逻辑，被 commands 调用。按功能拆分文件：
- `ai_client.rs` — 统一 HTTP 客户端（chat / analyze / test_connection），不混入 prompt 逻辑
- `prompt_manager.rs` — Prompt 三层管理（内置/全局/项目），构建/存取/校验
- `data_files.rs` — 文件 I/O

**models/** — 纯 `#[derive(Serialize, Deserialize)]` 结构体，禁止写业务逻辑、禁止依赖 services/ 或 commands/。

**utils/** — 通用工具，任何层可调用。

### 服务拆分标准

| 文件 | 职责 | 禁止混入 |
|------|------|---------|
| `ai_client.rs` | HTTP 请求、SSE 流式、JSON 解析、分析编排 | Prompt 构建/存取 |
| `prompt_manager.rs` | Prompt 三层解析、变量替换、校验、存取 | HTTP 调用 |
| `data_files.rs` | 原子读写、路径解析、缓存、导出 | 业务逻辑 |

### 错误处理

- service 层返回 `Result<T, String>`（或自定义错误）
- command 层统一 `.map_err(classify_ai_error)` 转为 `AppError`
- 禁止把 `reqwest::Error`、`io::Error` 等原始错误直接抛给前端

### 新增功能流程

1. `models/` 定义数据结构 → 2. `services/` 实现逻辑 → 3. `commands/` 暴露接口 → 4. `lib.rs` 的 `generate_handler!` 注册 → 5. `cargo check` 验证

## 前端开发规范（基于 docs/11-frontend-principles.md，每次写前端必须遵守）

### 目录职责

| 目录 | 职责 | 禁止 |
|------|------|------|
| `components/` | React 组件，只负责 JSX + 事件 + 局部 UI 状态 | 复杂业务逻辑、数据请求 |
| `hooks/` | 自定义 Hooks，封装副作用和 DOM 交互 | 包含 JSX |
| `lib/` | 纯函数（数据处理、API 封装、算法），不依赖 React | 包含组件或 Hook |
| `store/` | Zustand 全局状态，仅存跨组件共享的核心数据 | 存纯 UI 状态（弹窗开关等） |
| `types/` | 全局 TypeScript 类型定义 | 包含实现逻辑 |

### 组件设计原则

- **单一职责**：一个组件只做一件事。布局 + 数据 + 状态管理混在一起的必须拆分
- **文件规模**：单个组件 ≤ 300 行。超过 → 提取子组件或抽离 Hooks
- **Props 最小化**：避免多层透传，深层依赖用 Zustand 或 Context
- **受控/非受控明确**：表单组件必须明确设计为受控或非受控

### 状态管理（Zustand）

- `useState` — 仅局部 UI 状态（输入框、下拉、loading）
- `useAppStore` — 跨组件共享的业务数据（项目 ID、设置、列表）
- 派生状态用 `useMemo`，不存入 Store
- 必须用 Selector 精确订阅，避免无关状态触发重渲染

### 样式规范（Tailwind + shadcn/ui）

- 优先 Tailwind 原子类，禁止大段自定义 CSS
- 优先 shadcn/ui 组件，通过 Props 或 Tailwind 覆盖
- 颜色/间距/圆角用 CSS 变量，暗色模式用 `dark:` 修饰符

### 类型与错误处理

- **零容忍**：禁止 `any`、`@ts-ignore`、`@ts-expect-error`、不安全的 `as unknown as`
- 所有后端交互通过 `safeInvoke`，禁止裸调 `invoke`
- 错误必须转化为 Toast，严禁静默吞掉或只打 console
- 区分用户可修复错误 vs 系统异常

### 性能

- 复杂对象/函数用 `React.memo`、`useCallback`、`useMemo`
- React Flow 重渲染用内置虚拟化机制
- 重计算（目录遍历、ELK）放在 `useMemo` 中

### Tauri IPC

- 统一用 `safeInvoke`，不裸调 `invoke`
- 异步必须给反馈（Spinner、按钮禁用）
- 后端返回数据做防御性校验
