从零开始，按这个顺序准备，每一步验证通过后再往下走：
---
第一步：安装基础工具
1. Rust 工具链
访问 https://rustup.rs/ ，下载运行 rustup-init.exe（Windows），一路默认安装。
装完后打开终端验证：
rustc --version        # 应显示 1.79+ 或更高
cargo --version        # Rust 的包管理器
rustup target list     # 确认有 x86_64-pc-windows-msvc（Windows 默认会有）注意：Windows 上 Rust 需要 Visual Studio C++ 构建工具。如果安装过程中提示缺失，rustup 会自动引导你下载，或者手动去微软官网装 "Build Tools for Visual Studio"（选"使用 C++ 的桌面开发"）。
2. Node.js 运行时
访问 https://nodejs.org/ ，下载 LTS 版本（目前应该是 20.x），安装。
验证：
node --version    # v20.x.x
npm --version3. pnpm（包管理器）
npm 太慢且容易出依赖冲突，Tauri 官方推荐 pnpm。
npm install -g pnpm
pnpm --version    # 应显示 9.x---
第二步：配置 VS Code
安装以下插件（按优先级排序）：
插件名
作用

rust-analyzer
Rust 语言支持，代码补全、跳转、错误提示

ESLint
TS/React 代码规范检查

Prettier
代码格式化

Tailwind CSS IntelliSense
Tailwind 类名自动补全

Tauri
官方插件，提供 Tauri 项目的调试支持

Even Better TOML
Cargo.toml 语法高亮

配置建议：
• 在 VS Code 设置里打开 "editor.formatOnSave": true，让 Prettier 保存时自动格式化 TS 代码。
• Rust 代码由 rust-analyzer 自动格式化，不需要额外配置。
---
第三步：创建项目骨架
用 Tauri 官方脚手架一键生成：
# 创建项目（交互式选择）
npm create tauri-app@latest project-tracker

# 按提示选择：
# 项目名: project-tracker
# 前端模板: React
# 前端语言: TypeScript
# 包管理器: pnpm创建完成后，目录结构已经是我之前提到的 src/ + src-tauri/ 双目录结构。
验证项目能跑起来：
cd project-tracker
pnpm install          # 安装前端依赖
pnpm tauri dev        # 启动开发模式（会自动编译 Rust 后端 + 启动前端）如果一切正常，会弹出一个桌面窗口，显示 Tauri 默认的欢迎页面。
---
第四步：接入 shadcn/ui（前端组件库）
shadcn/ui 不是 npm 包，需要初始化到项目里：
# 在项目根目录下
npx shadcn-ui@latest init
按提示选择：
• Style: New York（更现代）或 Default（更圆润），推荐 New York
• Base color: Slate / Zinc / Neutral，推荐 Slate
• CSS variables: Yes（支持深色模式）
初始化完成后，你就可以随时添加组件：
npx shadcn-ui@latest add button
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add input
npx shadcn-ui@latest add select
# ... 按需添加---
第五步：安装核心依赖
# 前端核心库
pnpm add reactflow zustand lucide-react elkjs

# Tauri 前端 API（调用后端命令）
pnpm add @tauri-apps/api

# Rust 后端插件（在 src-tauri 目录下操作）
cd src-tauri
cargo add tauri-plugin-store
cargo add tauri-plugin-dialog
cargo add tauri-plugin-shell