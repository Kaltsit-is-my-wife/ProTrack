# Project Tracker — 开发日志

## 项目信息

| 项目名称 | project-tracker |
|---------|----------------|
| 创建日期 | 2025-07-09 |
| 运行平台 | Windows 11 (预留跨平台升级空间) |
| 开发工具 | VS Code + Claude Code Agent |

---

## 技术栈配置

### 基础工具版本

| 工具 | 版本 | 备注 |
|------|------|------|
| Rust | 1.79+ | rustup 安装 |
| Node.js | v20.x LTS | |
| pnpm | 9.x | Tauri 官方推荐的包管理器 |
| VS Code | 最新版 | 安装了 rust-analyzer, Tauri, Tailwind CSS IntelliSense 等插件 |

### 框架与库

| 模块 | 选型 | 版本 | 说明 |
|------|------|------|------|
| 框架 | Tauri 2.0 | 2.x | Rust 后端 + Web 前端 |
| 前端框架 | React + TypeScript | 19.x / 5.8.x | 实际安装为 React 19，原计划 React 18 |
| UI 组件库 | shadcn/ui (base-nova) | 4.13.0 | 使用 @base-ui/react 底层组件 |
| 样式方案 | Tailwind CSS | 3.4.19 | v3（非 v4），配合 PostCSS |
| 图标 | Lucide React | 1.23.0 | |
| 思维导图 | React Flow | 11.11.4 | |
| 状态管理 | Zustand | 5.0.14 | |
| 图形布局 | ELK.js | 0.11.1 | |
| 配置持久化 | tauri-plugin-store | 2.4.3 | Rust 端本地 JSON 存储 |
| 系统对话框 | tauri-plugin-dialog | 2.7.1 | 文件/目录选择对话框 |
| Shell 调用 | tauri-plugin-shell | 2.3.5 | 调用系统 Shell 命令 |
| 文件/链接打开 | tauri-plugin-opener | 2.5.4 | 生成时自带 |
| 动画 | tw-animate-css | 1.4.0 | 注意：此版本为 Tailwind v4 设计，与当前 v3 可能存在兼容问题 |
| 字体 | Geist Variable | 5.2.9 | |

---

## 操作记录

### 第一步：基础工具安装 ✅ (2025-07-09 之前)
- 安装 Rust 工具链 (rustup)
- 安装 Node.js LTS
- 安装 pnpm
- 配置 VS Code 及插件

### 第二步：项目骨架创建 ✅ (2025-07-09 之前)
```bash
npm create tauri-app@latest project-tracker
# 选择: React + TypeScript + pnpm
```
验证: `pnpm tauri dev` 窗口正常弹出。

### 第三步：接入 shadcn/ui ✅ (2025-07-09 之前)
```bash
npx shadcn@latest init
# 选择: base-nova 风格, neutral 基色, CSS variables
```
**注意**: 实际安装的是 shadcn v4.13.0，使用 @base-ui/react 作为底层组件库（而非旧版的 Radix UI）。样式为 `base-nova`，是 shadcn 的新版风格。

生成文件:
- `src/components/ui/button.tsx` — 按钮组件（基于 @base-ui/react/button）
- `src/lib/utils.ts` — cn() 工具函数（clsx + tailwind-merge）
- `components.json` — shadcn 配置文件
- `tailwind.config.js` — Tailwind 配置（含完整 shadcn 颜色映射）
- `tailwindcss.config.js` — 额外的 Tailwind 配置（仅含圆角变量，颜色不完整）
- `postcss.config.js` — PostCSS 配置
- `src/App.css` — 全局样式（含 CSS 变量、深色模式、Geist 字体）

### 第四步：安装核心依赖 ✅ (当前步骤)
```bash
# shadcn/ui 组件
npx shadcn@latest add dialog input select card label textarea switch separator scroll-area badge

# npm 包
pnpm add reactflow zustand elkjs

# Rust 插件
cargo add tauri-plugin-store
cargo add tauri-plugin-dialog
cargo add tauri-plugin-shell
```

---

## 遇到的问题与解决方案

### 问题 1: TypeScript 编译错误 — scroll-area.tsx 中未使用的 React 导入
**错误信息**: `error TS6133: 'React' is declared but its value is never read.`
**原因**: shadcn v4 生成的 `scroll-area.tsx` 包含 `import * as React from "react"`，但该组件未使用 `React.xxx` API（其他组件如 card.tsx、dialog.tsx 等使用了 `React.ComponentProps<>` 所以没有问题）。tsconfig 开启了 `noUnusedLocals: true`。
**解决方案**: 删除 `scroll-area.tsx` 中的 `import * as React from "react"` 行。
**状态**: ✅ 已修复

### 问题 2: Rust 编译错误 — tauri_plugin_store::init() 不存在
**错误信息**: `error[E0425]: cannot find function 'init' in crate 'tauri_plugin_store'`
**原因**: tauri-plugin-store v2.4.3 的 API 与旧版不同。新版本使用 Builder 模式：`tauri_plugin_store::Builder::new().build()`。
**解决方案**: 修改 `src-tauri/src/lib.rs`：
```rust
// 旧 (错误)
.plugin(tauri_plugin_store::init())
// 新 (正确)
.plugin(tauri_plugin_store::Builder::new().build())
```
**状态**: ✅ 已修复

### 问题 3: Tauri build 打包 MSI/NSIS 超时
**错误信息**: `failed to bundle project: timeout: global`
**原因**: `pnpm tauri build` 在创建 Windows 安装包时需要下载 WiX Toolset (v3) 和 NSIS，GitHub 下载超时。
**影响**: 仅影响 `.msi`/`.nsis` 安装包的生成，不影响开发和调试。
**解决方案**: 
- 使用 `pnpm tauri dev` 进行开发（无需打包步骤）
- 如需发布，可考虑 VPN 或手动下载 WiX/NSIS
**状态**: ⚠️ 已知问题，网络相关，待后续处理

### 问题 4: 两个 Tailwind 配置文件
**现状**: 项目根目录同时存在 `tailwind.config.js`（含完整 shadcn 颜色映射）和 `tailwindcss.config.js`（仅含圆角变量）。
**分析**: `components.json` 指向 `tailwind.config.js`，postcss 也使用 `tailwind.config.js`。`tailwindcss.config.js` 可能是生成时的残留文件。
**建议**: 确认 `tailwindcss.config.js` 是否被任何工具引用，如无引用可删除。
**状态**: 📝 待确认

### 问题 5: tw-animate-css 版本兼容性
**现状**: `tw-animate-css` v1.4.0 是为 Tailwind CSS v4 设计的动画插件，但项目当前使用 Tailwind CSS v3.4.19。
**影响**: 未知，目前构建成功未见报错。
**建议**: 确认 v1.4.0 是否兼容 v3，或降级到兼容 v3 的版本。
**状态**: 📝 待验证

---

## 当前项目状态

### 目录结构
```
project-tracker/
├── src/                          # React 前端
│   ├── main.tsx                  # 入口，挂载 <App/>
│   ├── App.tsx                   # 根组件 (Tauri IPC 演示)
│   ├── App.css                   # 全局样式 (shadcn CSS 变量 + 深色模式 + Geist 字体)
│   ├── vite-env.d.ts             # Vite 类型声明
│   ├── assets/react.svg          # React logo
│   ├── components/ui/            # shadcn/ui 组件 (11 个)
│   │   ├── button.tsx            # 按钮 (基于 @base-ui/react/button)
│   │   ├── dialog.tsx            # 对话框
│   │   ├── input.tsx             # 输入框
│   │   ├── select.tsx            # 选择器
│   │   ├── card.tsx              # 卡片
│   │   ├── label.tsx             # 标签
│   │   ├── textarea.tsx          # 文本域
│   │   ├── switch.tsx            # 开关
│   │   ├── separator.tsx         # 分隔线
│   │   ├── scroll-area.tsx       # 滚动区域
│   │   └── badge.tsx             # 徽章
│   └── lib/
│       └── utils.ts              # cn() 工具函数
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs               # 二进制入口
│   │   └── lib.rs                # Tauri Builder + 命令注册 + 插件注册
│   ├── Cargo.toml                # Rust 依赖
│   ├── tauri.conf.json           # Tauri 配置
│   ├── capabilities/default.json # 权限配置
│   ├── build.rs                  # 构建脚本
│   └── icons/                    # 应用图标
├── index.html                    # Vite 入口 HTML
├── vite.config.ts                # Vite 配置 (端口 1420, 路径别名 @/)
├── tsconfig.json                 # TypeScript 配置
├── tsconfig.node.json            # Node 端 TS 配置
├── tailwind.config.js            # Tailwind 主配置 (含 shadcn 颜色映射)
├── tailwindcss.config.js         # Tailwind 额外配置 (可能残留)
├── postcss.config.js             # PostCSS 配置
├── components.json               # shadcn/ui 配置
├── package.json                  # 前端依赖
├── pnpm-lock.yaml                # 依赖锁定
└── pnpm-workspace.yaml           # pnpm 工作区配置
```

### 前端依赖 (npm)
| 包名 | 版本 | 用途 |
|------|------|------|
| react | ^19.1.0 | UI 框架 |
| react-dom | ^19.1.0 | React DOM |
| @tauri-apps/api | ^2 | Tauri 前端 API (IPC 等) |
| @tauri-apps/plugin-opener | ^2 | 打开文件/链接 |
| @base-ui/react | ^1.6.0 | shadcn v4 底层 UI 组件 |
| class-variance-authority | ^0.7.1 | 组件变体管理 |
| clsx | ^2.1.1 | 类名合并 |
| tailwind-merge | ^3.6.0 | Tailwind 类名智能合并 |
| lucide-react | ^1.23.0 | 图标库 |
| reactflow | ^11.11.4 | 思维导图/流程图引擎 |
| zustand | ^5.0.14 | 状态管理 |
| elkjs | ^0.11.1 | 图形自动布局算法 |
| tw-animate-css | ^1.4.0 | Tailwind 动画 |
| @fontsource-variable/geist | ^5.2.9 | Geist 字体 |
| shadcn | ^4.13.0 | shadcn CLI (组件生成器) |

### Rust 依赖 (Cargo)
| 包名 | 版本 | 用途 |
|------|------|------|
| tauri | 2 | 框架核心 |
| tauri-plugin-opener | 2 | 打开文件/链接 |
| tauri-plugin-store | 2.4.3 | 本地持久化 JSON 存储 |
| tauri-plugin-dialog | 2.7.1 | 系统对话框 |
| tauri-plugin-shell | 2.3.5 | Shell 命令调用 |
| serde | 1 | 序列化/反序列化 |
| serde_json | 1 | JSON 处理 |

### 构建验证结果
- ✅ TypeScript 类型检查通过
- ✅ Vite 前端构建通过
- ✅ Rust 编译通过
- ✅ Release exe 生成: `src-tauri/target/release/project-tracker.exe`
- ⚠️ MSI/NSIS 打包因网络超时失败（不影响开发）
- ⏳ `pnpm tauri dev` 待用户手动验证

### 插件注册状态
已在 `lib.rs` 中注册的插件:
- `tauri_plugin_opener::init()`
- `tauri_plugin_store::Builder::new().build()`
- `tauri_plugin_dialog::init()`
- `tauri_plugin_shell::init()`

已在 `capabilities/default.json` 中授予的权限:
- `core:default`
- `opener:default`
- `store:default`
- `dialog:default`
- `shell:default`

### 第五步：创建 API 参考文档 ✅ (2025-07-09)

创建 `docs/` 目录，包含 6 份根据实际安装版本编写的 API 参考文档：

| 文件 | 内容 | 来源 |
|------|------|------|
| `01-tauri-frontend-api.md` | `@tauri-apps/api` v2.11.1 前端 API | Web 搜索 + 官方文档 |
| `02-tauri-backend-command.md` | Rust `#[tauri::command]` 后端 API | Web 搜索 + 官方文档 |
| `03-react-flow-v11-api.md` | React Flow v11.11.4 API | v11.reactflow.dev + 本地类型定义 |
| `04-zustand-v5-api.md` | Zustand v5.0.14 API | zustand.docs.pmnd.rs + 本地类型定义 |
| `05-elkjs-api.md` | ELK.js v0.11.1 图形布局 API | GitHub + 本地 elk-api.d.ts |
| `06-shadcn-ui-components.md` | shadcn/ui v4.13.0 已安装组件 | 本地组件源码 + 官方文档 |

### 版本差异发现 ⚠️

| 包名 | 预期版本 | 实际安装版本 | 差异说明 |
|------|---------|------------|---------|
| reactflow | 12.x (`@xyflow/react`) | **11.11.4** (`reactflow`) | v12 是新包名 `@xyflow/react`；本项目的 `reactflow` v11 使用 `parentId`（非 `parentNode`）但 API 不同 |
| zustand | 4.x | **5.0.14** | v5 需要双括号语法 `create<T>()()`，v4 是 `create<T>(fn)` |
| tailwindcss | 4.x | **3.4.19** | 仅影响 CSS 语法（v3: `@tailwind base`；v4: `@import "tailwindcss"`） |
| react | 18.x | **19.x** | 实际创建时安装了 React 19 |

**结论**: 所有文档按实际安装版本编写，代码开发需适配实际版本而非计划版本。

---

## 下一步工作计划

按 ready.md 规划，后续步骤:
1. 验证 `tailwind.config.js` 的 shadcn 颜色映射 → ✅ 已确认完整
2. 运行 `pnpm tauri dev` 验证窗口正常弹出 → ⏳ 待用户手动验证
3. 开始实现核心功能:
   - 三栏布局 (左侧项目列表 + 中间思维导图 + 右侧项目详情)
   - 项目目录添加与扫描
   - React Flow 思维导图渲染 (带交互)
   - 项目状态管理 (Zustand)
   - 设置页面
   - AI 功能接入
