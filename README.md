# Project Tracker

任务规划与工作进度追踪桌面应用，基于 Tauri 2.0 + React + TypeScript 构建。

编者：最初只是想要做一个能一键跳转电脑目录和文件位置的，带结构显示的工具，这样一些中转文件和文件夹就不用堆放桌面上了，我就可以欣赏我的壁纸了~

## 解决什么问题

管理多个软件项目时，你可能会遇到这些痛点：

- 项目散落在不同磁盘位置，切换文件夹翻找费时费力
- 项目多了以后记不清每个项目的进度、待办和上下文
- 想看项目目录结构，但 IDE 打开大项目慢，文件树滚动不过来
- 想让 AI 帮你分析项目架构、提出改进建议，但每次都要手动组织 prompt 和上下文

Project Tracker 把「项目管理 + 目录可视化 + AI 分析」集成在一个桌面应用里，让你能快速切换项目、一眼看清目录结构、一键让 AI 帮你分析代码组织。

## 功能

### 项目管理

- **多项目集中管理** — 添加本地项目目录，统一入口切换，带进度状态追踪（未开始 / 进行中 / 临近完成 / 已完成）
- **下一步工作计划** — 每个项目记录当前待办事项，支持预设词条快捷填写
- **项目规则自定义** — 为每个项目编写自定义规则（Layer 3 prompt），指导 AI 输出更贴合你的项目

### 目录思维导图

- **交互式目录可视化** — 将项目目录渲染为可交互的思维导图，一目了然看清代码结构
- **节点折叠/展开** — 点击目录节点收起或展开子节点，专注感兴趣的区域
- **导图深度控制** — 自由调整展示深度（0–5 级），避免深层嵌套信息过载
- **文件过滤隐藏** — 隐藏 node_modules、.git 等无关目录，也可自定义隐藏特定文件
- **右键菜单** — 节点右键呼出菜单（在文件管理器中打开）

### AI 分析

- **双层 AI 分析** — 核心分析（架构概览 + 风险识别 + 下一步建议）和文件组织分析（目录/文件组织优化建议），并行调用
- **AI 对话面板** — 右下角小球点击展开，支持流式输出，Markdown 渲染回答
- **三层提示词架构** — Layer 1 系统规则 + Layer 2 分析模板（可自定义）+ Layer 3 项目规则，AI 输出贴合项目实际
- **多 AI 提供商兼容** — 兼容 OpenAI API 格式和 Anthropic API，支持自定义端点、模型
- **分析历史管理** — 每次分析自动保存，时间线 / 下拉两种方式回溯

### 视图与体验

- **三栏布局** — 左侧项目列表 + 中间思维导图 + 右侧详情/AI 面板，可拖拽调整宽度
- **项目快照系统** — 切换项目时自动保存/恢复完整的思维导图视图状态（节点位置、折叠状态、深度等）
- **目录变更检测** — 后台比对目录指纹，项目目录有变动时列表出现橙色圆点提醒
- **明暗主题** — 支持浅色 / 深色 / 跟随系统三种模式

### 数据与安全

- **API Key 加密存储** — 用户配置的 API Key 使用 AES-256-GCM 加密落盘
- **分层持久化** — 配置、业务数据、缓存分离存储，自动保存（500ms 防抖），首次启动自动迁移旧数据
- **数据导出** — 一键导出所有项目和分析数据为 JSON
- **完全本地** — 所有数据存储在本地，不上传任何第三方服务器（AI API 除外，由你自行选择提供商）

## 目录结构

```
projectTracker/          ← Git 仓库根（本目录）
└── project-tracker/     ← 实际代码（Tauri + Vite）
```

## 环境要求

- **Rust** 1.79+ ([rustup.rs](https://rustup.rs/))
- **Node.js** 20.x LTS ([nodejs.org](https://nodejs.org/))
- **pnpm** 9.x (`npm install -g pnpm`)
- Windows 上需要 [Visual Studio C++ 构建工具](https://visualstudio.microsoft.com/downloads/)（选"使用 C++ 的桌面开发"）

## 快速开始

```bash
# 1. 进入代码目录
cd project-tracker

# 2. 安装前端依赖
pnpm install

# 3. 启动开发模式（编译 Rust 后端 + 启动前端，弹出桌面窗口）
pnpm tauri dev
```

首次运行 `pnpm tauri dev` 会编译 Rust 代码，需要几分钟。后续增量编译很快。

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm install` | 安装前端依赖 |
| `pnpm tauri dev` | 启动开发模式（桌面窗口 + 热更新） |
| `pnpm dev` | 仅启动前端 Vite 开发服务器（浏览器访问 `http://localhost:1420`） |
| `pnpm build` | TypeScript 类型检查 + Vite 构建 |
| `pnpm tauri build` | 完整构建（含 Windows 安装包 `.msi`） |
| `npx shadcn@latest add <name>` | 添加 shadcn/ui 组件 |

## 项目结构

```
project-tracker/
├── src/                  # React 前端
│   ├── main.tsx          # 入口
│   ├── App.tsx           # 主布局（三栏 + React Flow 思维导图）
│   ├── App.css           # 全局样式 + shadcn 主题
│   ├── components/       # 业务组件（设置、聊天、导图节点等）
│   ├── components/ui/    # shadcn/ui 基础组件
│   ├── hooks/            # 自定义 Hooks（面板拖拽、主题）
│   ├── lib/              # 核心逻辑（AI 调用、导图布局、持久化）
│   ├── store/            # Zustand 全局状态
│   └── types/            # TypeScript 类型定义
├── src-tauri/            # Tauri Rust 后端
│   └── src/
│       ├── commands/     # Tauri 命令（系统、目录、AI、数据、加密）
│       ├── models/       # 数据模型
│       ├── services/     # 业务服务（AI 客户端、数据文件）
│       └── utils/        # 工具（日志）
├── docs/                 # API 参考文档
└── DEVELOPMENT_LOG.md    # 开发日志
```

## 推荐 IDE 配置

- [VS Code](https://code.visualstudio.com/)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)

## 许可

Copyright (C) 2026 Free Kaltsit-is-my-wife

本项目基于 GNU General Public License v3.0（或之后版本）发布。详见 [LICENSE](LICENSE) 文件。
