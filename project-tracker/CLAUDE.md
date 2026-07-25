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
