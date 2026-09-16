# 双机协同开发规范

本规范约定在**两台电脑**上开发同一个 Project Tracker 仓库时的同步方式、环境搭建流程与常见故障处理。

---

## 一、拓扑

```
机器 A ──┐
         ├──► GitHub: github.com/Kaltsit-is-my-wife/ProTrack.git ──► 机器 B
机器 B ──┘
```

- **Git 仓库根**：外层 `projectTracker/`（`.git` 在此层）
- **实际代码**：内层 `project-tracker/`（Tauri + Vite）
- **唯一 .gitignore**：外层 `projectTracker/.gitignore`（内层禁止存在）
- 两台机器通过 `origin/main` 单一分支同步

---

## 二、什么会同步 / 什么不会

### 2.1 通过 Git 同步（两端一致）

| 内容 | 说明 |
|------|------|
| 全部源码 | `src/`、`src-tauri/src/` |
| `pnpm-lock.yaml` / `Cargo.lock` | **关键**：保证两端依赖版本完全一致 |
| 配置文件 | `tauri.conf.json`、`package.json`、`vite.config.ts`、`tailwind.config.js` |
| 文档与规范 | `CLAUDE.md`、`README.md`、`CHANGELOG.md`、`docs/` |
| 图标资源 | `src-tauri/icons/` |

### 2.2 被 gitignore，每台机器各自一份

| 内容 | 第二台机器怎么办 |
|------|-----------------|
| `project-tracker/node_modules/` | `pnpm install` 重建 |
| `project-tracker/src-tauri/target/` | 首次 `cargo build` 自动重建（**数分钟**） |
| `project-tracker/.env` | 可选，见 §三 |
| `references/` | 需手动重新下载（参考代码库） |
| `userRoaming/`、`testRoaming/` | 本地测试数据，按需手工拷贝，见 §六 |
| `.claude/` | Claude Code 本机项目配置，**不要拷贝** |

### 2.3 仓库外，完全不参与同步

| 内容 | 位置 |
|------|------|
| 应用配置 + API Key | `%APPDATA%/com.boyua.project-tracker/app-state.json` |
| AI 记忆文件 | `~/.claude/projects/f--vs-code-project-projectTracker/memory/` |
| 应用日志 | `%APPDATA%/com.boyua.project-tracker/log/` |

---

## 三、API Key 是机器绑定的（重点）

`src-tauri/src/commands/crypto.rs` 的密钥派生逻辑：

```rust
// SHA-256(USERNAME@COMPUTERNAME:project-tracker-kdf-v1)
let fingerprint = format!("{}@{}:project-tracker-kdf-v1", user, host);
```

**后果**：机器 A 加密的 API Key，在机器 B 上**无法解密**。

### 表现

- 启动时日志出现 `WARN [Persistence] API Key 解密失败，已清除`
- 设置页的 API Key 字段变为空
- AI 分析与对话全部失败（提示未配置 API Key）

### 处理

**在每台机器上各自重新输入一次 API Key**（设置页 → AI → API Key）。

❌ **不要拷贝 `app-state.json` 到另一台机器** —— 解密必然失败，且会把另一台机器的其他设置一并带过来。

> 这是有意的安全设计（密钥绑定本机用户+机器名），不是 bug。API Key 属于「极高敏感」数据，不应随文件流动。

---

## 四、日常流程

### 4.1 每次开始工作前

```bash
cd f:/vs_code/project/projectTracker
git pull --rebase
```

### 4.2 每次结束工作后

```bash
git add <具体文件>          # 禁止 git add .
git commit -m "..."
git push
```

### 4.3 切换机器前

必须满足**其中之一**，否则工作会丢失：

- 已 `commit` + `push`
- 或已 `git stash`

### 4.4 禁止事项

- ❌ 在两台机器上**同时**修改同一文件后各自提交（必然冲突）
- ❌ 用云盘（OneDrive / 坚果云等）同步仓库目录（会与 `.git` 打架）
- ❌ 拷贝 `node_modules/` 或 `src-tauri/target/` 跨机器（平台相关二进制）
- ❌ 拷贝 `.claude/` 或 `app-state.json` 跨机器

---

## 五、新机器环境搭建 Checklist

```bash
# 1. 克隆仓库
git clone https://github.com/Kaltsit-is-my-wife/ProTrack.git
cd ProTrack

# 2. 安装前端依赖（会用 pnpm-lock.yaml 锁定版本）
cd project-tracker
pnpm install

# 3. 启动开发模式（首次会完整编译 Rust 依赖，需数分钟）
pnpm tauri dev
```

### 环境依赖

| 组件 | 本机已验证版本 | 安装方式 |
|------|--------------|---------|
| Node.js | v24.15.0 | [nodejs.org](https://nodejs.org/) |
| pnpm | 11.10.0 | `npm install -g pnpm` |
| Rust | 1.96.1 | [rustup.rs](https://rustup.rs/) |
| MSVC 构建工具 | — | [VS 生成工具](https://visualstudio.microsoft.com/downloads/)，勾选「使用 C++ 的桌面开发」 |

### 搭建后手动步骤

1. **设置页填入 API Key**（见 §三）
2. **重新添加项目目录** —— 项目列表存在 `userRoaming/projects.json`，不随 git 同步
3. 按需重新下载 `references/` 参考代码库

---

## 六、测试数据目录说明

仓库根的 `userRoaming/` 与 `testRoaming/` 是**应用数据目录**（在设置页把「数据存储路径」指向了这里），用于在不污染真实 `%APPDATA%` 的前提下做测试。

```
userRoaming/                     ← 日常开发用
├── projects.json                # 项目列表、AI 分析历史、对话记录
├── prompts.json                 # L2 提示词模板
└── .project-tracker/
    └── cache/
        ├── snapshots.json       # 思维导图快照
        └── ai_debug/            # AI 原始响应对照
```

两者均被 gitignore。**可选**手工拷贝以保留项目列表，但注意：

- `projects.json` 里每个项目存的是**绝对路径** —— 若两台机器的磁盘布局不同（如 `F:\` vs `D:\`），项目会扫描失败，需重新添加
- `snapshots.json` 的快照同样绑定绝对路径，路径不匹配时代码会自动清除重建（`treeRootPath` 校验），属正常行为

---

## 七、版本一致性风险

⚠️ **当前项目未做版本锁定**：

- `package.json` 无 `engines` 字段
- `package.json` 无 `packageManager` 字段
- 无 `.nvmrc` / `rust-toolchain.toml`

**影响**：两台机器若 Node 或 Rust 版本不同，会出现「在 A 上能跑、B 上编译失败」或「行为不一致」的难排查问题。

**缓解措施（当前）**：升级工具链时两台机器同步升级，以 §五 表格的版本为准。

**建议（未实施）**：添加版本锁定文件，让 `pnpm` / `rustup` 自动切换版本。

---

## 八、常见故障速查

| 现象 | 原因 | 处理 |
|------|------|------|
| 设置页 API Key 为空，日志 `WARN 解密失败` | 拷贝了别的机器的 `app-state.json` | 在本机重新输入 API Key |
| 项目列表为空 | `projects.json` 在 `userRoaming/`，未同步 | 重新添加项目 |
| 项目显示但扫描失败 | `projects.json` 里的绝对路径在本机不存在 | 删除项目后重新添加 |
| 思维导图闪一下重置 | 快照路径不匹配，代码自动清除重建 | 正常行为，重新调整视图即可 |
| `cargo build` 报缺 `link.exe` | 新机器未装 MSVC C++ 构建工具 | 装「使用 C++ 的桌面开发」 |
| `pnpm install` 后依赖报错 | 两台机器 Node 版本不一致 | 统一 Node 版本 |
| 首次 `pnpm tauri dev` 卡很久 | Rust 依赖全量编译 | 正常，等数分钟 |

---

## 九、验证 Checklist

切换机器或新环境搭建后，确认：

- [ ] `git pull` 无冲突，本地与 `origin/main` 一致
- [ ] `pnpm install` 成功，`node_modules/` 存在
- [ ] `npx tsc --noEmit` 零错误
- [ ] `cargo check` 零警告（在 `src-tauri/` 下）
- [ ] `pnpm tauri dev` 能弹出桌面窗口
- [ ] 设置页 API Key 已配置且连接测试通过
- [ ] 能成功添加一个项目并渲染出思维导图
