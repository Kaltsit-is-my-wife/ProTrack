import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

/**
 * 监听主题设置并应用到 <html> 的 .dark 类。
 * 在 main.tsx 初始化后、渲染前调用一次即可。
 */
export function useTheme() {
  const theme = useAppStore((s) => s.settings.theme);

  useEffect(() => {
    const root = document.documentElement;

    function apply(active: "light" | "dark") {
      if (active === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq.matches ? "dark" : "light");

      const onChange = (e: MediaQueryListEvent) =>
        apply(e.matches ? "dark" : "light");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }

    apply(theme);
  }, [theme]);
}
