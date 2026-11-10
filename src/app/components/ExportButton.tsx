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
  quiz?: Array<{
    question_zh?: string;
    question_fr?: string;
    question_en?: string;
    options_zh?: string[];
    answer_zh?: string;
    explanation_zh?: string;
  }> | null;
  mode: "snippet" | "document";
  className?: string;
}

export default function ExportButton(props: ExportButtonProps) {
  const { translation, analysis, keywords, mermaid, quiz, className = "" } = props;

  const hasContent = translation || analysis || keywords || mermaid || (quiz && quiz.length > 0);

  if (!hasContent) return null;

  const handleExport = () => {
    const content = buildLearningNoteMarkdown(props);
    downloadMarkdownFile("智译西电_笔记", content);
  };

  return (
    <button
      onClick={handleExport}
      className={"study-button " + className}
      title="导出为 Markdown 笔记"
    >
      <Download size={13} />
      导出笔记
    </button>
  );
}
