"use client";

export interface QuizItemSnapshot {
  question_zh?: string;
  question_fr?: string;
  question_en?: string;
  options_zh?: string[];
  answer_zh?: string;
  explanation_zh?: string;
}

export interface LearningNoteSnapshot {
  translation?: string | null;
  analysis?: string | null;
  keywords?: string | null;
  mermaid?: string | null;
  quiz?: QuizItemSnapshot[] | null;
  mode: "snippet" | "document";
}

export interface LiveSubtitleSnapshot {
  originalText: string;
  translation?: string;
  status?: string;
}

export interface LiveInsightSnapshot {
  term: string;
  explanation?: string;
  snippet?: string;
}

export interface LiveSessionSnapshot {
  inputSource: string;
  language: string;
  isListening: boolean;
  errorMessage?: string | null;
  subtitles: LiveSubtitleSnapshot[];
  insights: LiveInsightSnapshot[];
}

export interface PdfStatusCardSnapshot {
  title: string;
  description: string;
  tone?: "info" | "warning";
}

export interface PdfChatMessageSnapshot {
  role: "user" | "assistant";
  content: string;
}

export interface PdfStudyNoteSnapshot {
  fileName: string;
  pageCount: number;
  deepMode: boolean;
  extractStatus: string;
  extractReason?: string | null;
  scanFallbackMode: boolean;
  scanPageSelection?: string | null;
  lastResolvedPageLabel?: string | null;
  summary?: string | null;
  statusCard?: PdfStatusCardSnapshot | null;
  chatMessages: PdfChatMessageSnapshot[];
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getLocalTimestampParts(date: Date) {
  return {
    year: date.getFullYear(),
    month: pad(date.getMonth() + 1),
    day: pad(date.getDate()),
    hour: pad(date.getHours()),
    minute: pad(date.getMinutes()),
  };
}

function pushDivider(lines: string[]) {
  if (lines.length === 0) {
    return;
  }

  lines.push("---");
  lines.push("");
}

function pushSection(lines: string[], title: string, body: string) {
  lines.push(title);
  lines.push("");
  lines.push(body);
  lines.push("");
}

function formatLanguageLabel(language: string) {
  return language.startsWith("fr") ? "法语" : "英语";
}

function formatInputSourceLabel(inputSource: string) {
  return inputSource === "tab" ? "标签页音频" : "麦克风";
}

function formatSubtitleStatus(status?: string) {
  if (status === "sending") {
    return "翻译生成中";
  }

  if (status === "error") {
    return "翻译失败";
  }

  return "翻译完成";
}

export function formatExportDisplayTime(date = new Date()) {
  const { year, month, day, hour, minute } = getLocalTimestampParts(date);
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function formatExportFilenameTimestamp(date = new Date()) {
  const { year, month, day, hour, minute } = getLocalTimestampParts(date);
  return `${year}${month}${day}${hour}${minute}`;
}

export function downloadMarkdownFile(
  filenameBase: string,
  content: string,
  date = new Date()
) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = `${filenameBase}_${formatExportFilenameTimestamp(date)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildLearningNoteMarkdown(snapshot: LearningNoteSnapshot) {
  const lines: string[] = [];

  lines.push("# 智译西电 — 学习笔记");
  lines.push("");
  lines.push(`> 导出时间：${formatExportDisplayTime()}`);
  lines.push(`> 模式：${snapshot.mode === "snippet" ? "片段速译" : "课件精读"}`);
  lines.push("");

  if (snapshot.translation) {
    pushDivider(lines);
    pushSection(lines, "## 📝 精准翻译", snapshot.translation);
  }

  if (snapshot.analysis) {
    pushDivider(lines);
    pushSection(lines, "## 🔍 深度解析", snapshot.analysis);
  }

  if (snapshot.keywords) {
    pushDivider(lines);
    lines.push("## 📚 关键术语");
    lines.push("");
    const keywordLines = snapshot.keywords.split("\n").filter((line) => line.trim());
    keywordLines.forEach((line) => {
      lines.push(`- ${line}`);
    });
    lines.push("");
  }

  if (snapshot.mermaid) {
    pushDivider(lines);
    lines.push("## 🧠 知识脉络");
    lines.push("");
    lines.push("```mermaid");
    lines.push(snapshot.mermaid);
    lines.push("```");
    lines.push("");
  }

  if (snapshot.quiz && snapshot.quiz.length > 0) {
    pushDivider(lines);
    lines.push("## 🧪 随堂小测");
    lines.push("");
    snapshot.quiz.forEach((item, index) => {
      lines.push(
        `### ${index + 1}. ${
          item.question_zh || item.question_fr || item.question_en || "未命名题目"
        }`
      );
      lines.push("");
      const options = item.options_zh || [];
      options.forEach((option, optionIndex) => {
        lines.push(`- ${String.fromCharCode(65 + optionIndex)}. ${option}`);
      });
      if (item.answer_zh) {
        lines.push("");
        lines.push(`**正确答案：** ${item.answer_zh}`);
      }
      if (item.explanation_zh) {
        lines.push("");
        lines.push(`**解析：** ${item.explanation_zh}`);
      }
      lines.push("");
    });
  }

  pushDivider(lines);
  lines.push("*由 智译西电 AI 生成*");

  return lines.join("\n");
}

export function buildLiveSessionMarkdown(snapshot: LiveSessionSnapshot) {
  const lines: string[] = [];

  lines.push("# 智译西电 — 随堂同传记录");
  lines.push("");
  lines.push(`> 导出时间：${formatExportDisplayTime()}`);
  lines.push(`> 输入源：${formatInputSourceLabel(snapshot.inputSource)}`);
  lines.push(`> 语言：${formatLanguageLabel(snapshot.language)} (${snapshot.language})`);
  lines.push(`> 收音状态：${snapshot.isListening ? "进行中" : "已停止"}`);
  lines.push(`> 当前错误：${snapshot.errorMessage?.trim() || "无"}`);
  lines.push("");

  pushDivider(lines);
  lines.push("## 🎧 双语字幕快照");
  lines.push("");
  if (snapshot.subtitles.length === 0) {
    lines.push("当前暂无内容。");
    lines.push("");
  } else {
    snapshot.subtitles.forEach((item, index) => {
      lines.push(`### ${index + 1}. 字幕片段`);
      lines.push("");
      lines.push(`- 状态：${formatSubtitleStatus(item.status)}`);
      lines.push(`- 原文：${item.originalText}`);
      lines.push(`- 中文：${item.translation?.trim() || "当前暂无内容。"}`);
      lines.push("");
    });
  }

  pushDivider(lines);
  lines.push("## 🧠 术语洞察");
  lines.push("");
  if (snapshot.insights.length === 0) {
    lines.push("当前暂无内容。");
    lines.push("");
  } else {
    snapshot.insights.forEach((card, index) => {
      lines.push(`### ${index + 1}. ${card.term}`);
      lines.push("");
      lines.push(card.explanation?.trim() || "当前暂无解释。");
      lines.push("");
      lines.push(`- 上下文片段：${card.snippet?.trim() || "当前暂无内容。"}`);
      lines.push("");
    });
  }

  pushDivider(lines);
  lines.push("*导出内容为当前页面快照，不会自动停止正在进行的同传。*");

  return lines.join("\n");
}

export function buildPdfStudyNoteMarkdown(snapshot: PdfStudyNoteSnapshot) {
  const lines: string[] = [];

  lines.push("# 智译西电 — 文献精读笔记");
  lines.push("");
  lines.push(`> 导出时间：${formatExportDisplayTime()}`);
  lines.push(`> 文件名：${snapshot.fileName}`);
  lines.push(`> 页数：${snapshot.pageCount || 0}`);
  lines.push(`> 模式：${snapshot.deepMode ? "深度模式" : "极速模式"}`);
  lines.push(`> 文本提取状态：${snapshot.extractStatus}`);
  lines.push(
    `> 解析说明：${
      snapshot.extractReason?.trim() ||
      snapshot.statusCard?.description?.trim() ||
      "当前暂无额外说明。"
    }`
  );
  lines.push("");

  pushDivider(lines);
  lines.push("## 📄 摘要与解析状态");
  lines.push("");
  if (snapshot.summary?.trim()) {
    lines.push(snapshot.summary.trim());
    lines.push("");
  } else if (snapshot.statusCard) {
    lines.push(`**${snapshot.statusCard.title}**`);
    lines.push("");
    lines.push(snapshot.statusCard.description);
    lines.push("");
  } else {
    lines.push("当前暂无内容。");
    lines.push("");
  }

  pushDivider(lines);
  lines.push("## 🧷 扫描版补充");
  lines.push("");
  if (snapshot.scanFallbackMode || snapshot.extractStatus === "scan_like") {
    lines.push("- 当前处于扫描版 PDF 问答模式。");
    lines.push(
      `- 最近解析范围：${
        snapshot.lastResolvedPageLabel?.trim() ||
        snapshot.scanPageSelection?.trim() ||
        "当前暂无范围记录。"
      }`
    );
    lines.push("");
  } else {
    lines.push("当前为可提取文本的 PDF 模式。");
    lines.push("");
  }

  pushDivider(lines);
  lines.push("## 💬 文献问答记录");
  lines.push("");
  if (snapshot.chatMessages.length === 0) {
    lines.push("当前暂无内容。");
    lines.push("");
  } else {
    snapshot.chatMessages.forEach((message, index) => {
      lines.push(
        `### ${index + 1}. ${message.role === "user" ? "用户提问" : "AI 助教回复"}`
      );
      lines.push("");
      lines.push(message.content);
      lines.push("");
    });
  }

  pushDivider(lines);
  lines.push("*导出内容来自当前前端状态快照，不会额外触发新的 AI 请求。*");

  return lines.join("\n");
}
