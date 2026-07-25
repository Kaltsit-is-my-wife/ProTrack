# Tauri 2.0 前端 API 参考

> **安装版本**: `@tauri-apps/api` v2.11.1
> **官方文档**: https://v2.tauri.app/reference/javascript/api/

---

## 核心导入路径变更 (v1 → v2)

| 功能 | v1 路径 (已废弃) | v2 路径 (正确) |
|------|-----------------|--------------|
| IPC 调用 | `@tauri-apps/api/tauri` | `@tauri-apps/api/core` |
| 事件监听 | `@tauri-apps/api/event` | `@tauri-apps/api/event` |
| 窗口管理 | `@tauri-apps/api/window` | `@tauri-apps/api/window` |
| 路径转换 | `@tauri-apps/api/tauri` | `@tauri-apps/api/core` |

---

## 1. `@tauri-apps/api/core` — IPC 调用核心

### `invoke<T>(cmd, args?, options?)`

前端调用 Rust 后端的唯一入口。

```typescript
import { invoke } from '@tauri-apps/api/core';

// 签名
function invoke<T>(
  cmd: string,
  args?: InvokeArgs,
  options?: InvokeOptions
): Promise<T>

// 基本用法
const result = await invoke<string>('greet', { name: 'World' });

// 带错误处理
try {
  const data = await invoke<MyData>('get_data', { id: 123 });
} catch (error) {
  console.error('Command failed:', error);
}
```

### `convertFileSrc(filePath, protocol?)`

将本地文件路径转换为前端可访问的 URL。

```typescript
import { convertFileSrc } from '@tauri-apps/api/core';

const assetUrl = convertFileSrc('C:\\Users\\me\\image.png');
// → 'https://asset.localhost/image.png'
```

---

## 2. `@tauri-apps/api/event` — 事件系统

```typescript
import { listen, emit, once } from '@tauri-apps/api/event';

// 监听后端事件
const unlisten = await listen<PayloadType>('event-name', (event) => {
  console.log(event.payload);
});

// 发送事件到后端
await emit('frontend-event', { data: 'hello' });

// 只监听一次
const unlistenOnce = await once<PayloadType>('one-time', (event) => {
  console.log(event.payload);
});

// 取消监听
unlisten();
```

---

## 3. `@tauri-apps/api/window` — 窗口管理

```typescript
import { getCurrentWindow, getAllWindows } from '@tauri-apps/api/window';

const appWindow = getCurrentWindow();

// 窗口标题
await appWindow.setTitle('Project Tracker');

// 窗口大小
await appWindow.setSize(1200, 800);
await appWindow.setMinSize(800, 600);

// 窗口位置
await appWindow.center();

// 全屏
await appWindow.setFullscreen(true);

// 关闭
await appWindow.close();

// 获取物理尺寸
const size = await appWindow.innerSize();
```

---

## 4. `@tauri-apps/api/path` — 路径工具

```typescript
import { appDataDir, documentDir, desktopDir, join } from '@tauri-apps/api/path';

const appData = await appDataDir();
const docs = await documentDir();
const desktop = await desktopDir();
const configPath = await join(appData, 'config.json');
```

---

## 5. `@tauri-apps/api/dialog` — 对话框

```typescript
import { open, save, message, ask } from '@tauri-apps/plugin-dialog';

// 打开文件
const file = await open({
  multiple: false,
  filters: [{ name: 'All Files', extensions: ['*'] }],
});

// 打开目录
const folder = await open({
  directory: true,
  multiple: false,
});

// 确认对话框
const yes = await ask('Are you sure?', { title: 'Confirm' });
```

---

## 6. Tauri Plugin Store — 本地持久化

```typescript
import { Store } from '@tauri-apps/plugin-store';

// 创建/加载 store
const store = await Store.load('settings.json');

// 读写
await store.set('theme', { value: 'dark' });
const theme = await store.get<{ value: string }>('theme');

// 检查键
const exists = await store.has('theme');

// 删除
await store.delete('theme');

// 保存到磁盘
await store.save();

// 获取所有键值
const entries = await store.entries();
```

---

## 重要注意事项

1. **不使用 v1 导入路径**: `@tauri-apps/api/tauri` 在 v2 中不存在
2. **命令必须注册**: Rust 端 `#[tauri::command]` 必须加入 `generate_handler![]`
3. **序列化**: 所有参数和返回值必须实现 `serde::Serialize` / `serde::Deserialize`
4. **全局访问**: 当 `app.withGlobalTauri: true` 时，可以通过 `window.__TAURI__.core.invoke()` 访问
5. **安全限制**: Tauri 2.0 CSP 限制更严格，需在 `capabilities/default.json` 中显式声明权限
