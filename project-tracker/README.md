# Project Tracker

任务规划与工作进度追踪桌面应用，基于 Tauri 2.0 + React + TypeScript 构建。

## 环境要求

- **Rust** 1.79+ ([rustup.rs](https://rustup.rs/))
- **Node.js** 20.x LTS ([nodejs.org](https://nodejs.org/))
- **pnpm** 9.x (`npm install -g pnpm`)
- Windows 上需要 [Visual Studio C++ 构建工具](https://visualstudio.microsoft.com/downloads/)（选"使用 C++ 的桌面开发"）

## 快速开始

```bash
# 1. 进入项目目录
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
│   ├── App.tsx           # 主布局（三栏结构）
│   ├── App.css           # 全局样式 + shadcn 主题
│   ├── components/ui/    # shadcn/ui 组件
│   └── lib/utils.ts      # 工具函数
├── src-tauri/            # Tauri Rust 后端
│   ├── src/lib.rs        # 命令定义 + 插件注册
│   └── Cargo.toml        # Rust 依赖
├── docs/                 # API 参考文档
└── DEVELOPMENT_LOG.md    # 开发日志
```

## 推荐 IDE 配置

- [VS Code](https://code.visualstudio.com/)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)
