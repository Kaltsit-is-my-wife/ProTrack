import { initLogger } from "@/lib/logger";
import { initPersistence } from "@/lib/persistence";

// ⚠️ 日志最先初始化
console.log("[Boot] 初始化日志系统...");
initLogger();
console.log("[Boot] 日志系统就绪");

import React from "react";
import "./App.css";
import ReactDOM from "react-dom/client";
import App from "./App";

// 恢复持久化状态后再渲染 React
async function bootstrap() {
  console.log("[Boot] 开始恢复持久化状态...");
  const start = performance.now();
  await initPersistence();
  console.log("[Boot] 持久化恢复完成, 耗时:", (performance.now() - start).toFixed(0), "ms");

  // 确保所有已追踪项目都存在 .project-tracker/ 目录
  const { invoke } = await import("@tauri-apps/api/core");
  const { useAppStore } = await import("@/store/useAppStore");
  const projects = useAppStore.getState().projects;
  for (const p of projects) {
    invoke("ensure_project_tracker_dir", { projectPath: p.path }).catch(() => {});
  }
  console.log(`[Boot] 检查 .project-tracker | ${projects.length} 个项目`);

  console.log("[Boot] 渲染 React 应用...");
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  console.log("[Boot] React 应用已挂载");
}

bootstrap();
