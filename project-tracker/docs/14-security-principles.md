# 安全与敏感信息处理规范

Project Tracker 作为本地优先（Local-first）桌面应用，在数据隐私、密钥保护、外部通信及开源合规方面遵循本规范。

---

## 一、 敏感数据识别与分类

| 级别 | 数据 | 保护要求 |
|------|------|---------|
| **极高敏感** | AI API Key、用户自定义提示词（含业务机密） | 加密落盘、掩码展示、日志脱敏 |
| **高敏感** | 项目目录路径、文件内容、AI 对话历史 | 本地存储、HTTPS 传输、不对外上报 |
| **中敏感** | 应用日志、加密派生因子（Username/ComputerName） | 本地文件、日期轮转、不包含极敏感数据 |

---

## 二、 数据生命周期安全控制

### 2.1 输入与展示（UI 层）

- API Key 输入框必须使用 `type="password"` 掩码
- 设置页展示 API Key 时仅显示掩码或长度（如"已配置（32位）"）
- 复制 AI 回复时不附带项目路径等敏感上下文
- 禁止在前端 console / ErrorBoundary 中输出 API Key 明文

### 2.2 内存与运行时（Runtime）

- API Key 仅在 Zustand Store 初始化时从加密存储加载，运行时保持明文
- 不用的敏感数据应尽早释放（Rust 端 `drop` 相关 String）
- 不实现内存转储或 core dump 收集

### 2.3 落盘与持久化（Storage）

- **强制加密**：API Key 写入磁盘前必须经 AES-256-GCM 加密（`enc:v1:` 前缀格式）
- **隔离存储**：业务数据、缓存、配置严格存放于 `%APPDATA%` 或用户指定数据目录
- **禁止散落**：敏感数据不得写入项目代码目录、不得随 Git 提交
- 加密密钥派生：`SHA-256(USERNAME@COMPUTERNAME:salt)`，绑定本机

### 2.4 日志与调试（Logging）

- **强制脱敏**：日志中禁止输出 API Key 明文、完整用户文件内容
- 允许记录：Key 长度（`keyLen: 32`）、Key 前/后 4 位掩码
- `ai_debug/` 目录仅保存 AI 返回结果，不保存用户发送的 prompt 原文
- Release 模式下仅 ERROR 级别日志写入文件

---

## 三、 外部通信与依赖安全

### 3.1 网络请求

- 所有 AI 服务请求必须使用 HTTPS（reqwest 默认 TLS）
- 请求头 `Authorization: Bearer <KEY>` 仅存在于 HTTP 请求中，不缓存到磁盘
- 连接超时必须设置明确值，防止挂起泄露

### 3.2 供应链安全

- Rust 依赖通过 crates.io 获取，锁定 `Cargo.lock`
- 前端依赖通过 pnpm 管理，锁定 `pnpm-lock.yaml`
- 加密使用标准库：`aes-gcm`、`sha2`、`getrandom`（均为 crates.io 已验证 crate）
- 定期 `cargo audit` / `pnpm audit` 检查已知漏洞

---

## 四、 开源合规与法律底线

### 4.1 许可证

- 项目代码：GNU General Public License v3.0（或之后版本）
- 所有源文件头部必须包含 GPL v3 声明
- 新引入依赖前检查许可证兼容性（禁止引入 AGPL 等冲突许可证的依赖）

### 4.2 版权

- 版权声明的格式：`Copyright (C) <year> <copyright-holder>`
- 根目录必须有 `LICENSE` 文件

---

## 五、 关键红线（零容忍）

| 红线 | 说明 |
|------|------|
| 🚫 **严禁硬编码** | API Key、密码、Token 绝对禁止以明文写在 `.ts` / `.rs` 或提交到 Git |
| 🚫 **严禁日志裸奔** | `console.log` 或 `logger.write` 中绝对禁止输出未脱敏的 API Key 和用户私密文件内容 |
| 🚫 **严禁明文落盘** | API Key 绝对禁止以明文写入 `app-state.json` 或任何本地文件 |

---

## 六、 验证 Checklist

- [ ] API Key 输入框使用 `type="password"`
- [ ] API Key 落盘前经 `encrypt_setting` 加密
- [ ] 日志中不包含 API Key 明文（仅记录长度或哈希）
- [ ] `.env` 文件在 `.gitignore` 中
- [ ] `tauri.conf.json` 无硬编码敏感信息
- [ ] 源文件头部有 GPL v3 声明
- [ ] 新依赖已检查许可证兼容性
- [ ] `cargo check` + `npx tsc --noEmit` 通过
