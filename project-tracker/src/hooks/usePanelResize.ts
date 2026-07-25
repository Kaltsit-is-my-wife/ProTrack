import { useState, useEffect, useCallback, useRef } from "react";

interface UsePanelResizeOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  /** 拖拽方向：1 表示向右拖增大面板，-1 表示向左拖增大面板（右侧面板用） */
  direction?: 1 | -1;
}

export function usePanelResize({
  initialWidth,
  minWidth,
  maxWidth,
  direction = 1,
}: UsePanelResizeOptions) {
  const [width, setWidth] = useState(initialWidth);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(initialWidth);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      startWidthRef.current = width;
      setIsDragging(true);
    },
    [width],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = (e.clientX - startXRef.current) * direction;
      setWidth(
        clamp(startWidthRef.current + delta, minWidth, maxWidth),
      );
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, minWidth, maxWidth, direction]);

  return { width, isDragging, handleMouseDown };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
