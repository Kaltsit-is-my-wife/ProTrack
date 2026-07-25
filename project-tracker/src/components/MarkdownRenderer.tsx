import { useMemo } from "react";
import { marked } from "marked";

// ============================================================
// 配置 marked
// ============================================================

marked.setOptions({
  breaks: true,  // 单换行 → <br>
  gfm: true,     // GitHub Flavored Markdown
});

// ============================================================
// MarkdownRenderer
// ============================================================

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const html = useMemo(() => {
    if (!content) return "";
    const raw = marked.parse(content);
    // marked.parse 在 18.x 返回 string | Promise<string>
    return typeof raw === "string" ? raw : "";
  }, [content]);

  return (
    <div
      className="md-rendered"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
