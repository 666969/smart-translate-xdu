"use client";

import { useEffect, useRef, useState } from "react";

interface MermaidRendererProps {
  code: string;
}

/**
 * Mermaid 图表渲染组件
 * 接收 mermaid 源代码字符串，渲染为 SVG 图形
 */
export default function MermaidRenderer({ code }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!code) return;

    let cancelled = false;

    async function renderMermaid() {
      // 生成唯一 ID
      const id = `mermaid-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      try {
        // 动态导入 mermaid（仅客户端）
        const mermaid = (await import("mermaid")).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            primaryColor: "#e8f0fe",
            primaryTextColor: "#1a3a5c",
            primaryBorderColor: "#4a8af4",
            lineColor: "#4a8af4",
            secondaryColor: "#f0f7ff",
            tertiaryColor: "#fff",
            fontFamily: '"Noto Sans SC", "Inter", sans-serif',
            fontSize: "14px",
          },
          flowchart: {
            curve: "basis",
            padding: 12,
          },
          securityLevel: "loose",
          suppressErrorRendering: true,
        });

        const { svg: renderedSvg } = await mermaid.render(id, code);

        if (!cancelled) {
          setSvg(renderedSvg);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[Mermaid] 渲染失败:", err);
          setError(err instanceof Error ? err.message : "图表渲染失败");
          setSvg("");
        }

        // 清除 Mermaid 崩溃后强行往 body 塞进来的原生报错 SVG 容器
        try {
          const orphan1 = document.getElementById(id);
          if (orphan1 && orphan1.parentElement === document.body) orphan1.remove();
          const orphan2 = document.getElementById(`d${id}`);
          if (orphan2 && orphan2.parentElement === document.body) orphan2.remove();
        } catch (e) {
          // 忽略清理报错
        }
      }
    }

    renderMermaid();

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="w-full">
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700 mb-3">
          <p className="font-medium mb-1">⚠️ 思维导图渲染失败</p>
          <p className="text-xs text-amber-600">{error}</p>
        </div>
        {/* 回退：显示原始 mermaid 代码 */}
        <pre className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700 overflow-x-auto whitespace-pre font-mono">
          {code}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <svg
            className="animate-spin text-primary"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray="31.4 31.4"
              strokeLinecap="round"
            />
          </svg>
          正在生成思维导图...
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full overflow-x-auto mermaid-container"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
