"use client";

import { Download } from "lucide-react";
import {
  buildLearningNoteMarkdown,
  downloadMarkdownFile,
} from "@/lib/markdownExport";

interface ExportButtonProps {
  originalText?: string | null;
  translation?: string | null;
  analysis?: string | null;
  keywords?: string | null;
  mermaid?: string | null;
  mode: "snippet" | "document";
  className?: string;
}

export default function ExportButton(props: ExportButtonProps) {
  const { translation, analysis, keywords, mermaid, className = "" } = props;

  const hasContent = translation || analysis || keywords || mermaid;

  if (!hasContent) return null;

  const handleExport = () => {
    const content = buildLearningNoteMarkdown(props);
    downloadMarkdownFile("智译西电_笔记", content);
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
