# Zustand 状态管理参考 (v5.0.14)

> **安装版本**: `zustand` v5.0.14
> **官方文档**: https://github.com/pmndrs/zustand
> **重要**: v5 与 v4 API 有重大差异！

---

## 1. v5 核心语法：双括号 `create<T>()()`

```typescript
import { create } from 'zustand';

interface BearStore {
  bears: number;
  increase: (by: number) => void;
  reset: () => void;
}

// ✅ v5 正确语法（双括号）
const useBearStore = create<BearStore>()((set) => ({
  bears: 0,
  increase: (by) => set((state) => ({ bears: state.bears + by })),
  reset: () => set({ bears: 0 }),
}));

// ❌ v4 语法（不再推荐）
const useBearStore = create<BearStore>((set) => ({ ... }));
```

---

## 2. 在组件中使用

```typescript
// 选择单个字段（推荐— 精确重渲染控制）
const bears = useBearStore((state) => state.bears);
const increase = useBearStore((state) => state.increase);

// 选择多个字段 — 使用 useShallow 防止不必要的重渲染
import { useShallow } from 'zustand/react/shallow';

const { bears, increase } = useBearStore(
  useShallow((state) => ({
    bears: state.bears,
    increase: state.increase,
  }))
);

// ❌ 避免 — 任何状态变化都会触发重渲染
const store = useBearStore();
```

---

## 3. Store 定义模式

### 基础模式
```typescript
interface ProjectStore {
  projects: Project[];
  currentProjectId: string | null;
  addProject: (project: Project) => void;
  setCurrentProject: (id: string) => void;
}

const useProjectStore = create<ProjectStore>()((set) => ({
  projects: [],
  currentProjectId: null,
  addProject: (project) =>
    set((state) => ({ projects: [...state.projects, project] })),
  setCurrentProject: (id) => set({ currentProjectId: id }),
}));
```

### Slice 模式（多领域拆分）
```typescript
// projectSlice.ts
interface ProjectSlice {
  projects: Project[];
  addProject: (p: Project) => void;
}

const createProjectSlice: StateCreator<ProjectSlice> = (set) => ({
  projects: [],
  addProject: (p) => set((state) => ({ projects: [...state.projects, p] })),
});

// settingsSlice.ts
interface SettingsSlice {
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
}

const createSettingsSlice: StateCreator<SettingsSlice> = (set) => ({
  theme: 'light',
  setTheme: (t) => set({ theme: t }),
});

// store.ts — 合并
type Store = ProjectSlice & SettingsSlice;

const useStore = create<Store>()((...args) => ({
  ...createProjectSlice(...args),
  ...createSettingsSlice(...args),
}));
```

---

## 4. 中间件

### persist — 持久化到 localStorage
```typescript
import { persist, createJSONStorage } from 'zustand/middleware';

const useStore = create<Settings>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'app-settings',      // localStorage key
      storage: createJSONStorage(() => localStorage),
      // partialize: (state) => ({ theme: state.theme }), // 只持久化部分字段
    }
  )
);
```

### devtools — Redux DevTools 支持
```typescript
import { devtools } from 'zustand/middleware';

const useStore = create<Store>()(
  devtools(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 }), false, 'increment'),
    }),
    { name: 'MyStore' }
  )
);
```

---

## 5. v4 → v5 迁移要点

| 项目 | v4 | v5 |
|------|----|----|
| 导入 | `import create from 'zustand'` | `import { create } from 'zustand'` |
| TypeScript | `create<State>(fn)` | `create<State>()(fn)` (双括号) |
| Min React | 16.8+ | 18+ |
| Min TypeScript | 任意 | 4.5+ |
| persist 初始存储 | 创建时写入 | 需显式调用 setState |

---

## 6. 非 React 环境使用

```typescript
import { createStore } from 'zustand/vanilla';

const store = createStore<BearStore>()((set) => ({
  bears: 0,
  increase: (by) => set((state) => ({ bears: state.bears + by })),
}));

// 读取
const bears = store.getState().bears;

// 更新
store.setState({ bears: 5 });

// 订阅
const unsub = store.subscribe((state, prevState) => {
  console.log('changed:', state, prevState);
});
```

---

## 7. 最佳实践

1. **始终用选择器**: `useStore(s => s.field)` 而非解构整个 store
2. **多值用 useShallow**: 防止引用变化导致的重渲染
3. **接口分离**: 将 state 和 actions 定义在同一 interface 中，但用 set 修改
4. **immutable 更新**: `set((state) => ({ ...state, field: newValue }))` 用于需要基于当前 state 的更新
5. **action 命名清晰**: 使用动词开头如 `add`, `remove`, `set`, `update`
