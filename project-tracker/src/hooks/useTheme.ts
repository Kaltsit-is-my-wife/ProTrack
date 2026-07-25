// Copyright (C) 2026 Free Kaltsit-is-my-wife
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
