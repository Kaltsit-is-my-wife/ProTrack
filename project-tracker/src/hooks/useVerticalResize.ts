import { useState, useEffect, useCallback, useRef } from "react";

interface Options {
  /** 初始上半占比 (0–100) */
  initialPercent?: number;
  /** 最小上半占比 */
  minPercent?: number;
  /** 最大上半占比 */
  maxPercent?: number;
}

/**
 * 垂直面板拆分拖拽。
 * 返回上半百分比 (0–100)、拖拽状态、mousedown 处理器。
 */
export function useVerticalResize({
  initialPercent = 70,
  minPercent = 30,
  maxPercent = 90,
}: Options = {}) {
  const [percent, setPercent] = useState(initialPercent);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const startPct = useRef(initialPercent);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startY.current = e.clientY;
      startPct.current = percent;
      setDragging(true);
    },
    [percent],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const height = rect.height;
      if (height === 0) return;

      const dy = e.clientY - startY.current;
      const dpct = (dy / height) * 100;
      const next = startPct.current + dpct;
      setPercent(clamp(next, minPercent, maxPercent));
    };

    const onUp = () => setDragging(false);

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, minPercent, maxPercent]);

  return { percent, dragging, handleMouseDown, containerRef };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
