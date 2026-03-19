"use client";

import { Download } from "lucide-react";

interface ExportButtonProps {
  translation?: string | null;
  analysis?: string | null;
  keywords?: string | null;
  mermaid?: string | null;
  mode: "snippet" | "document";
  className?: string;
}

function buildMarkdownContent(props: ExportButtonProps): string {
  const lines: string[] = [];
  const timestamp = new Date().toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  lines.push(`# 智译西电 — 学习笔记`);
  lines.push("");
  lines.push(`> 导出时间：${timestamp}`);
  lines.push(`> 模式：${props.mode === "snippet" ? "片段速译" : "课件精读"}`);
  lines.push("");

  if (props.translation) {
    lines.push("---");
    lines.push("");
    lines.push("## 📝 精准翻译");
    lines.push("");
    lines.push(props.translation);
    lines.push("");
  }

  if (props.analysis) {
    lines.push("---");
    lines.push("");
    lines.push("## 🔍 深度解析");
    lines.push("");
    lines.push(props.analysis);
    lines.push("");
  }

  if (props.keywords) {
    lines.push("---");
    lines.push("");
    lines.push("## 📚 关键术语");
    lines.push("");
    const keywordLines = props.keywords.split("\n").filter((l) => l.trim());
    keywordLines.forEach((line) => {
      lines.push(`- ${line}`);
    });
    lines.push("");
  }

  if (props.mermaid) {
    lines.push("---");
    lines.push("");
    lines.push("## 🧠 知识脉络");
    lines.push("");
    lines.push("```mermaid");
    lines.push(props.mermaid);
    lines.push("```");
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("*由 [智译西电](https://smart-translate.xdu.edu.cn) AI 生成*");

  return lines.join("\n");
}

export default function ExportButton(props: ExportButtonProps) {
  const { translation, analysis, keywords, mermaid, className = "" } = props;

  const hasContent = translation || analysis || keywords || mermaid;

  if (!hasContent) return null;

  const handleExport = () => {
    const content = buildMarkdownContent(props);
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace(/[-:T]/g, "");
    const filename = `智译西电_笔记_${timestamp}.md`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:shadow-md hover:shadow-emerald-500/25 hover:scale-[1.02] active:scale-[0.98] ${className}`}
      title="导出为 Markdown 笔记"
    >
      <Download size={13} />
      导出笔记
    </button>
  );
}
